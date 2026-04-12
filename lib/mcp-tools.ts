import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { FathomClient } from '../src/fathom-client';
import {
  formatMeetingToMarkdown,
  formatMeetingList,
  formatTranscriptToMarkdown,
  formatActionItems,
  formatDate,
} from '../src/formatters';
import { decrypt } from './crypto';

/**
 * Get a FathomClient from either an injected client (stdio mode)
 * or by decrypting the auth token (HTTP/OAuth mode).
 */
function getFathomClient(injectedClient?: FathomClient, extra?: { authInfo?: { token: string } }): FathomClient {
  if (injectedClient) return injectedClient;
  const token = extra?.authInfo?.token;
  if (!token) throw new Error('No Fathom API key: no injected client and no auth token');
  const apiKey = decrypt(token);
  return new FathomClient(apiKey);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Extra = any; // RequestHandlerExtra is complex; tool callbacks receive it as 2nd arg

export function registerTools(server: McpServer, fathom?: FathomClient) {
  server.tool(
    'list_meetings',
    {
      limit: z.number().optional().describe('Maximum number of meetings to return (default: 10, use 0 for all)'),
      created_after: z.string().optional().describe('ISO 8601 timestamp - only return meetings after this date'),
      created_before: z.string().optional().describe('ISO 8601 timestamp - only return meetings before this date'),
      include_external_only: z.boolean().optional().describe('Only include meetings with external participants'),
    },
    async ({ limit, created_after, created_before, include_external_only }, extra: Extra) => {
      const client = getFathomClient(fathom, extra);
      const response = await client.listMeetings({
        created_after,
        created_before,
        calendar_invitees_domains_type: include_external_only ? 'one_or_more_external' : undefined,
      });

      let meetings = response.items;
      if (limit && limit > 0) {
        meetings = meetings.slice(0, limit);
      }

      return {
        content: [{ type: 'text' as const, text: formatMeetingList(meetings) }],
      };
    }
  );

  server.tool(
    'get_meeting',
    {
      recording_id: z.number().describe('The recording ID of the meeting to retrieve'),
      include_transcript: z.boolean().optional().describe('Include the full transcript (default: true)'),
      include_summary: z.boolean().optional().describe('Include the AI summary (default: true)'),
      include_action_items: z.boolean().optional().describe('Include action items (default: true)'),
      include_crm_matches: z.boolean().optional().describe('Include CRM matches (default: true)'),
    },
    async ({ recording_id, include_transcript, include_summary, include_action_items, include_crm_matches }, extra: Extra) => {
      const client = getFathomClient(fathom, extra);
      const response = await client.listMeetings({
        include_transcript: include_transcript !== false,
        include_summary: include_summary !== false,
        include_action_items: include_action_items !== false,
        include_crm_matches: include_crm_matches !== false,
      });

      const meeting = response.items.find(m => m.recording_id === recording_id);
      if (!meeting) {
        return {
          content: [{ type: 'text' as const, text: `Meeting with recording ID ${recording_id} not found.` }],
          isError: true,
        };
      }

      return {
        content: [{ type: 'text' as const, text: formatMeetingToMarkdown(meeting) }],
      };
    }
  );

  server.tool(
    'get_transcript',
    {
      recording_id: z.number().describe('The recording ID of the meeting'),
    },
    async ({ recording_id }, extra: Extra) => {
      const client = getFathomClient(fathom, extra);
      const response = await client.getTranscript(recording_id);
      return {
        content: [{ type: 'text' as const, text: formatTranscriptToMarkdown(response.transcript) }],
      };
    }
  );

  server.tool(
    'search_meetings',
    {
      participant_emails: z.array(z.string()).optional().describe('Email addresses of participants to search for'),
      domains: z.array(z.string()).optional().describe('Company domains to search for (e.g., acme.com)'),
      teams: z.array(z.string()).optional().describe('Team names to filter by'),
      created_after: z.string().optional().describe('ISO 8601 timestamp'),
      created_before: z.string().optional().describe('ISO 8601 timestamp'),
    },
    async ({ participant_emails, domains, teams, created_after, created_before }, extra: Extra) => {
      const client = getFathomClient(fathom, extra);
      const response = await client.listMeetings({
        calendar_invitees: participant_emails,
        calendar_invitees_domains: domains,
        teams,
        created_after,
        created_before,
      });

      return {
        content: [{ type: 'text' as const, text: formatMeetingList(response.items) }],
      };
    }
  );

  server.tool(
    'get_action_items',
    {
      recording_id: z.number().optional().describe('Get action items from a specific meeting'),
      include_completed: z.boolean().optional().describe('Include completed action items (default: true)'),
      limit: z.number().optional().describe('Number of recent meetings to check if no recording_id (default: 10)'),
    },
    async ({ recording_id, include_completed, limit }, extra: Extra) => {
      const client = getFathomClient(fathom, extra);
      const meetingLimit = limit || 10;

      if (recording_id) {
        const response = await client.listMeetings({ include_action_items: true });
        const meeting = response.items.find(m => m.recording_id === recording_id);

        if (!meeting) {
          return {
            content: [{ type: 'text' as const, text: `Meeting with recording ID ${recording_id} not found.` }],
            isError: true,
          };
        }

        let items = meeting.action_items || [];
        if (include_completed === false) {
          items = items.filter(i => !i.completed);
        }

        const title = meeting.title || meeting.meeting_title || `Meeting ${meeting.recording_id}`;
        return {
          content: [{ type: 'text' as const, text: `## Action Items from: ${title}\n\n${formatActionItems(items)}` }],
        };
      } else {
        const response = await client.listMeetings({ include_action_items: true });
        const meetings = response.items.slice(0, meetingLimit);

        const sections: string[] = [];
        for (const meeting of meetings) {
          let items = meeting.action_items || [];
          if (items.length === 0) continue;
          if (include_completed === false) {
            items = items.filter(i => !i.completed);
          }
          if (items.length === 0) continue;

          const title = meeting.title || meeting.meeting_title || `Meeting ${meeting.recording_id}`;
          const date = formatDate(meeting.recording_start_time);
          sections.push(`### ${title}\n_${date}_\n\n${formatActionItems(items)}`);
        }

        const markdown = sections.length > 0
          ? `# Action Items from Recent Meetings\n\n${sections.join('\n\n')}`
          : 'No action items found in recent meetings.';

        return {
          content: [{ type: 'text' as const, text: markdown }],
        };
      }
    }
  );

  server.tool(
    'list_teams',
    {},
    async (_args: Record<string, never>, extra: Extra) => {
      const client = getFathomClient(fathom, extra);
      const teams = await client.getAllTeams();

      if (teams.length === 0) {
        return { content: [{ type: 'text' as const, text: 'No teams found.' }] };
      }

      const markdown = teams.map(t => {
        const created = formatDate(t.created_at);
        return `- **${t.name}** (created: ${created})`;
      }).join('\n');

      return {
        content: [{ type: 'text' as const, text: `# Teams\n\n${markdown}` }],
      };
    }
  );

  server.tool(
    'list_team_members',
    {
      team: z.string().optional().describe('Filter by team name'),
    },
    async ({ team }, extra: Extra) => {
      const client = getFathomClient(fathom, extra);
      const members = await client.getAllTeamMembers(team);

      if (members.length === 0) {
        return {
          content: [{ type: 'text' as const, text: team ? `No members found in team "${team}".` : 'No team members found.' }],
        };
      }

      const markdown = members.map(m => `- **${m.name}** <${m.email}>`).join('\n');
      const title = team ? `Team Members: ${team}` : 'All Team Members';

      return {
        content: [{ type: 'text' as const, text: `# ${title}\n\n${markdown}` }],
      };
    }
  );

  server.tool(
    'create_webhook',
    {
      destination_url: z.string().describe('URL to receive webhook events'),
      include_transcript: z.boolean().optional().describe('Include transcript in webhook payload'),
      include_summary: z.boolean().optional().describe('Include summary in webhook payload'),
      include_action_items: z.boolean().optional().describe('Include action items in webhook payload'),
      include_crm_matches: z.boolean().optional().describe('Include CRM matches in webhook payload'),
      triggered_for: z.array(z.enum(['my_recordings', 'shared_external_recordings', 'my_shared_with_team_recordings', 'shared_team_recordings'])).optional().describe('Which recordings trigger the webhook'),
    },
    async ({ destination_url, include_transcript, include_summary, include_action_items, include_crm_matches, triggered_for }, extra: Extra) => {
      const client = getFathomClient(fathom, extra);
      const webhook = await client.createWebhook({
        destination_url,
        include_transcript,
        include_summary,
        include_action_items,
        include_crm_matches,
        triggered_for,
      });

      const maskedSecret = webhook.secret
        ? `${webhook.secret.slice(0, 4)}..${webhook.secret.slice(-4)}`
        : 'N/A';
      const markdown = `# Webhook Created Successfully\n\n| Field | Value |\n|-------|-------|\n| **ID** | ${webhook.id} |\n| **URL** | ${webhook.url} |\n| **Secret (masked)** | \`${maskedSecret}\` |\n| **Include Transcript** | ${webhook.include_transcript} |\n| **Include Summary** | ${webhook.include_summary} |\n| **Include Action Items** | ${webhook.include_action_items} |\n| **Include CRM Matches** | ${webhook.include_crm_matches} |\n| **Triggered For** | ${webhook.triggered_for.join(', ')} |\n\n**Important:** Retrieve the full webhook secret from your Fathom dashboard.`;

      return {
        content: [{ type: 'text' as const, text: markdown }],
      };
    }
  );

  server.tool(
    'delete_webhook',
    {
      webhook_id: z.string().regex(/^[\w-]+$/, 'Invalid webhook ID format').describe('The ID of the webhook to delete'),
    },
    async ({ webhook_id }, extra: Extra) => {
      const client = getFathomClient(fathom, extra);
      await client.deleteWebhook(webhook_id);
      return {
        content: [{ type: 'text' as const, text: `Webhook ${webhook_id} deleted successfully.` }],
      };
    }
  );
}
