import type { FileInput } from './types.js';

/**
 * Example configs for the "Try a sample" button. Every secret here is fake
 * and deliberately does not match a real token format, so secret scanners
 * stay quiet; the plaintext-secret check still fires on them by name.
 */
export const SAMPLES: FileInput[] = [
  {
    name: 'claude_desktop_config.json',
    text: JSON.stringify(
      {
        mcpServers: {
          filesystem: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '/Users/alex'] },
          github: {
            command: 'docker',
            args: ['run', '-i', '--rm', '-e', 'GITHUB_PERSONAL_ACCESS_TOKEN', 'ghcr.io/github/github-mcp-server'],
            env: { GITHUB_PERSONAL_ACCESS_TOKEN: '${GITHUB_TOKEN}' },
          },
          'desktop-commander': { command: 'npx', args: ['-y', '@wonderwhy-er/desktop-commander@0.2.3'] },
          postgres: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-postgres', 'postgresql://admin:example-password@db.internal.example/prod'] },
          notion: { command: 'npx', args: ['-y', '@notionhq/notion-mcp-server'], env: { NOTION_API_KEY: 'example-not-a-real-key-1234' } },
          time: { command: 'uvx', args: ['mcp-server-time==0.6.2'] },
        },
      },
      null,
      2,
    ),
  },
  {
    name: '.cursor/mcp.json',
    text: `{
  // Cursor project config (JSONC comments are fine)
  "mcpServers": {
    "playwright": { "command": "npx", "args": ["@playwright/mcp@latest", "--user-data-dir", "~/Library/Application Support/Google/Chrome"] },
    "remote-docs": { "url": "http://docs-mcp.example.com/sse" },
    "runner": { "command": "bash", "args": ["-c", "cd ~/tools && ./start-mcp.sh"], "autoApprove": ["run_command"] },
  }
}`,
  },
  {
    name: '.claude/settings.json',
    text: JSON.stringify(
      {
        permissions: {
          allow: ['Bash(npm run test:*)', 'Bash(curl:*)', 'Edit', 'WebFetch', 'mcp__github'],
          deny: [],
          defaultMode: 'acceptEdits',
        },
        enableAllProjectMcpServers: true,
        hooks: { PostToolUse: [{ matcher: 'Edit', hooks: [{ type: 'command', command: 'npx prettier --write "$CLAUDE_FILE_PATHS"' }] }] },
      },
      null,
      2,
    ),
  },
  {
    name: 'ai-sidebar/manifest.json',
    text: JSON.stringify(
      {
        manifest_version: 3,
        name: 'AI Page Sidebar',
        version: '4.2.0',
        permissions: ['tabs', 'storage', 'scripting', 'cookies', 'clipboardRead', 'sidePanel'],
        host_permissions: ['<all_urls>'],
        optional_permissions: ['history'],
        content_scripts: [{ matches: ['<all_urls>'], js: ['content.js'] }],
      },
      null,
      2,
    ),
  },
  {
    name: 'ai-autocomplete/package.json',
    text: JSON.stringify(
      {
        name: 'ai-autocomplete',
        displayName: 'AI Autocomplete',
        publisher: 'example',
        version: '1.8.0',
        engines: { vscode: '^1.90.0' },
        main: './dist/extension.js',
        activationEvents: ['onStartupFinished'],
        contributes: { chatParticipants: [{ id: 'autocomplete.chat', name: 'complete' }] },
      },
      null,
      2,
    ),
  },
];

/** Where each supported config lives, for the "where do I find these?" help. */
export const LOCATIONS: Array<{ tool: string; paths: string[] }> = [
  { tool: 'Claude Desktop', paths: ['macOS: ~/Library/Application Support/Claude/claude_desktop_config.json', 'Windows: %APPDATA%\\Claude\\claude_desktop_config.json'] },
  { tool: 'Claude Code', paths: ['~/.claude.json (user + per-project MCP servers)', '<project>/.mcp.json', '~/.claude/settings.json and <project>/.claude/settings.json (permissions, hooks)'] },
  { tool: 'Cursor', paths: ['~/.cursor/mcp.json', '<project>/.cursor/mcp.json'] },
  { tool: 'VS Code', paths: ['<project>/.vscode/mcp.json', 'User settings.json ("mcp.servers")', 'Extensions: ~/.vscode/extensions/<id>/package.json'] },
  { tool: 'Windsurf', paths: ['~/.codeium/windsurf/mcp_config.json'] },
  { tool: 'Cline', paths: ['VS Code globalStorage: saoudrizwan.claude-dev/settings/cline_mcp_settings.json'] },
  {
    tool: 'Chrome / Edge extensions',
    paths: [
      'macOS: ~/Library/Application Support/Google/Chrome/Default/Extensions/<id>/<version>/manifest.json',
      'Windows: %LOCALAPPDATA%\\Google\\Chrome\\User Data\\Default\\Extensions\\<id>\\<version>\\manifest.json',
      'Linux: ~/.config/google-chrome/Default/Extensions/<id>/<version>/manifest.json',
    ],
  },
];
