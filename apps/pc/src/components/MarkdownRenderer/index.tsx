import React from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import styles from './index.less';

interface MarkdownRendererProps {
  content: string;
  /** 是否允许渲染原始 HTML(用于公告等富文本) */
  allowHtml?: boolean;
  /** 去掉默认容器(背景/内边距/阴影)，交由外部容器包裹 */
  bare?: boolean;
}

const Index: React.FC<MarkdownRendererProps> = ({
  content,
  allowHtml = false,
  bare = false,
}) => {
  const rehypePlugins = allowHtml ? [rehypeRaw, rehypeSanitize] : undefined;

  return (
    <div
      className={
        bare ? `${styles.markdownBody} ${styles.bare}` : styles.markdownBody
      }
    >
      <ReactMarkdown rehypePlugins={rehypePlugins}>{content}</ReactMarkdown>
    </div>
  );
};

export default Index;
