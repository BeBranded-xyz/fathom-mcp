export const metadata = {
  title: 'Fathom MCP',
  description: 'MCP server for Fathom.video',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
