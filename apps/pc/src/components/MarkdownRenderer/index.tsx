import React from 'react';
import ReactMarkdown from 'react-markdown';
import styles from './index.less';

interface MarkdownRendererProps {
  content: string;
}

const Index: React.FC<MarkdownRendererProps> = ({ content }) => {
  return (
    <div className={styles.markdownBody}>
      <ReactMarkdown>{content}</ReactMarkdown>
    </div>
  );
};

export default Index;
