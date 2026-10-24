export async function GET() {
  const content = 'google.com, pub-1553785773930597, DIRECT, f08c47fec0942fa0';
  return new Response(content, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=86400, s-maxage=86400',
    },
  });
}
