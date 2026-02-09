import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  tutorialSidebar: [
    'intro',
    {
      type: 'category',
      label: 'Getting Started',
      items: [
        'getting-started/installation',
        'getting-started/quick-start',
      ],
    },
    // Tutorials reserved for future releases
    // {
    //   type: 'category',
    //   label: 'Tutorials',
    //   items: [
    //     'tutorials/index',
    //   ],
    // },
    // Demos moved to Research section
    // {
    //   type: 'category',
    //   label: 'Demos',
    //   items: [
    //     'demos/lammps-molecular-dynamics',
    //     'demos/paraview-flow-visualization',
    //     'demos/earthscope-seismology',
    //   ],
    // },
    {
      type: 'category',
      label: 'Deployment',
      items: [
        'deployment/hpc-cluster',
        'deployment/configuration',
        'deployment/performance',
        'deployment/monitoring',
      ],
    },
    {
      type: 'category',
      label: 'CLIO Kit',
      items: [
        'agent-toolkit/mcp',
        // Future sections (placeholders)
        // 'agent-toolkit/bash',
        // 'agent-toolkit/script',
        // 'agent-toolkit/skills',
        // 'agent-toolkit/plugins',
        // 'agent-toolkit/extensions',
      ],
    },
    {
      type: 'category',
      label: 'IOWarp SDK',
      items: [
        'sdk/interprocess',
        'sdk/runtime_modules',
        'sdk/context_transfer',
        'sdk/context_assimilation',
      ],
    },
    {
      type: 'category',
      label: 'API Reference',
      items: [
        'api/python-api',
        'api/storage',
        'api/agents',
      ],
    },
    {
      type: 'category',
      label: 'FAQ',
      items: [
        'faq/index',
      ],
    },
  ],
};

export default sidebars;
