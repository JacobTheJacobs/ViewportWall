// Minimal MCP server over stdio: newline-delimited JSON-RPC 2.0, the three methods a client needs, and ping.
// Hand-rolled so the package has no dependencies and can ship as one file.
const PROTOCOL = '2024-11-05';

export function serve({ name, version, tools, call }) {
  const send = msg => process.stdout.write(JSON.stringify(msg) + '\n');
  const reply = (id, result) => send({ jsonrpc: '2.0', id, result });
  const fail = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } });

  const handle = async msg => {
    const { id, method, params } = msg;
    if (id === undefined) return;                      // a notification: nothing to answer
    try {
      if (method === 'initialize') {
        return reply(id, {
          protocolVersion: params?.protocolVersion === '2025-06-18' ? params.protocolVersion : PROTOCOL,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name, version },
        });
      }
      if (method === 'ping') return reply(id, {});
      if (method === 'tools/list') return reply(id, { tools });
      if (method === 'tools/call') {
        const tool = tools.find(t => t.name === params?.name);
        if (!tool) return reply(id, { isError: true, content: [{ type: 'text', text: `Unknown tool: ${params?.name}` }] });
        try { return reply(id, await call(params.name, params.arguments || {})); }
        catch (e) { return reply(id, { isError: true, content: [{ type: 'text', text: String(e?.message || e) }] }); }
      }
      if (method === 'resources/list') return reply(id, { resources: [] });
      if (method === 'prompts/list') return reply(id, { prompts: [] });
      fail(id, -32601, `Method not found: ${method}`);
    } catch (e) { fail(id, -32603, String(e?.message || e)); }
  };

  let buf = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => {
    buf += chunk;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line) continue;
      let msg; try { msg = JSON.parse(line); } catch { continue; }
      Array.isArray(msg) ? msg.forEach(handle) : handle(msg);
    }
  });
  process.stdin.on('end', () => process.exit(0));
}
