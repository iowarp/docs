import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docsSidebar: [
    'intro',
    {
      type: 'category',
      label: 'Getting Started',
      collapsed: false,
      items: [
        'getting-started/installation',
        'getting-started/quick-start',
      ],
    },
    {
      type: 'category',
      label: 'CLIO Kit',
      items: [
        'clio-kit/mcp-servers',
      ],
    },
    {
      type: 'category',
      label: 'SDK Reference',
      items: [
        'sdk/interprocess',
        'sdk/runtime-modules',
        'sdk/context-transfer',
        'sdk/context-assimilation',
      ],
    },
    {
      type: 'category',
      label: 'API Reference',
      items: [
        'api/python',
        'api/agents',
        'api/storage',
      ],
    },
    {
      type: 'category',
      label: 'Deployment',
      items: [
        'deployment/configuration',
        'deployment/hpc-cluster',
        'deployment/performance',
        'deployment/monitoring',
      ],
    },
    'faq',
    'tutorials',
  ],
};

export default sidebars;
