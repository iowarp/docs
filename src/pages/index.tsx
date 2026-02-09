import React from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';

const sections = [
  {
    icon: '🚀',
    title: 'Getting Started',
    description: 'Install IOWarp, set up your environment, and run your first context orchestration pipeline in minutes.',
    link: '/docs/getting-started/installation',
  },
  {
    icon: '🧰',
    title: 'CLIO Kit',
    description: '16 MCP servers with 150+ tools for HDF5, Slurm, ParaView, Pandas, ArXiv, and more. IDE-ready integration.',
    link: '/docs/clio-kit/mcp-servers',
  },
  {
    icon: '🔧',
    title: 'SDK Reference',
    description: 'Build with Chimaera: IPC primitives, runtime modules, the Context Transfer Engine, and Context Assimilation Engine.',
    link: '/docs/sdk/interprocess',
  },
  {
    icon: '📡',
    title: 'API Reference',
    description: 'Python bindings, agent integration APIs, and storage interfaces for programmatic access to IOWarp.',
    link: '/docs/api/python',
  },
  {
    icon: '🏗️',
    title: 'Deployment',
    description: 'Configuration reference, HPC cluster deployment, performance tuning, and monitoring for production environments.',
    link: '/docs/deployment/configuration',
  },
  {
    icon: '❓',
    title: 'FAQ',
    description: 'Common questions about IOWarp, context engineering concepts, licensing, and community resources.',
    link: '/docs/faq',
  },
];

function DocCard({icon, title, description, link}: {icon: string; title: string; description: string; link: string}) {
  return (
    <Link to={link} className="docs-landing__card">
      <span className="docs-landing__card-icon">{icon}</span>
      <h3 className="docs-landing__card-title">{title}</h3>
      <p className="docs-landing__card-desc">{description}</p>
    </Link>
  );
}

export default function Home(): React.JSX.Element {
  return (
    <Layout
      title="IOWarp Documentation"
      description="Technical documentation for the IOWarp context orchestration platform for agentic AI in scientific computing."
    >
      <main className="docs-landing">
        <div className="docs-landing__hero">
          <h1 className="docs-landing__title">
            <span>IOWarp</span> Documentation
          </h1>
          <p className="docs-landing__subtitle">
            Technical reference for the context orchestration platform powering agentic AI in scientific computing.
          </p>
          <div className="docs-landing__actions">
            <Link to="/docs/getting-started/installation" className="docs-landing__btn docs-landing__btn--primary">
              Get Started →
            </Link>
            <Link to="/docs/intro" className="docs-landing__btn docs-landing__btn--secondary">
              Overview
            </Link>
          </div>
        </div>

        <div className="docs-landing__grid">
          {sections.map((section) => (
            <DocCard key={section.title} {...section} />
          ))}
        </div>
      </main>
    </Layout>
  );
}
