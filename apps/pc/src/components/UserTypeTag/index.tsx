import styles from './index.less';

interface UserTypeTagProps {
  /** 用户类型: 0/空 不显示; 1 机器人; 2 企业; 其他非0 特殊 */
  type?: number | null;
}

const META: Record<number, { label: string; className: string }> = {
  1: { label: '机器人', className: styles.robot },
  2: { label: '企业', className: styles.enterprise },
};

/** 用户类型标签: 0/空不渲染, 其他非0类型显示对应 pill */
const UserTypeTag: React.FC<UserTypeTagProps> = ({ type }) => {
  if (!type) return null;
  const meta = META[type] ?? { label: '特殊', className: styles.other };
  return (
    <span className={`${styles.tag} ${meta.className}`}>{meta.label}</span>
  );
};

export default UserTypeTag;
