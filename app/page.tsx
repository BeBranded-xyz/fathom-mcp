export default function Home() {
  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 600, margin: '4rem auto', padding: '0 1rem' }}>
      <h1>Fathom MCP Server</h1>
      <p style={{ color: '#666', marginTop: '1rem' }}>
        This is a remote MCP server for <a href="https://fathom.video">Fathom.video</a>.
      </p>
      <p style={{ color: '#666', marginTop: '0.5rem' }}>
        To connect, add this server as a custom connector in Claude using the URL:
      </p>
      <code style={{ display: 'block', background: '#f4f4f4', padding: '0.75rem', borderRadius: 6, marginTop: '0.5rem' }}>
        {`{your-deployment-url}/mcp`}
      </code>
    </div>
  );
}
