# IOWarp Documentation

Technical documentation for the [IOWarp](https://iowarp.ai) context engineering platform.

**Live site**: [docs.iowarp.ai](https://docs.iowarp.ai)

## Development

```bash
# Install dependencies
npm install

# Start dev server
npm start

# Build for production
npm run build
```

## Structure

```
docs/                          # Documentation markdown files
  getting-started/             # Installation and quick start
  deployment/                  # HPC cluster deployment
  agent-toolkit/               # CLIO Kit MCP servers
  sdk/                         # IOWarp SDK (Hermes, Chimaera, CLIO Transfer)
  api/                         # Python and Storage API reference
  faq/                         # Troubleshooting
static/                        # Static assets
docusaurus.config.ts           # Site configuration
sidebars.ts                    # Sidebar navigation
```

## Related Sites

- [iowarp.ai](https://iowarp.ai) — Main project website (Astro)
- [toolkit.iowarp.ai](https://toolkit.iowarp.ai) — CLIO Kit MCP server showcase (Docusaurus)
- [docs.iowarp.ai](https://docs.iowarp.ai) — This site (Docusaurus)

## License

BSD 3-Clause License. See [LICENSE](LICENSE).
