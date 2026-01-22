import React, { useState, useMemo } from 'react';
import { CloseOutlined, SearchOutlined } from '@ant-design/icons';
import styles from './styles/Search.less';

interface SearchItem {
  id: string;
  name: string;
  avatar: string;
  description: string;
}

const mockSearchData: SearchItem[] = [
  { id: '1', name: '张三', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=1', description: '产品经理' },
  { id: '2', name: '李四', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=2', description: '前端开发工程师' },
  { id: '3', name: '王五', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=3', description: '后端架构师' },
  { id: '4', name: '赵六', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=4', description: 'UI设计师' },
  { id: '5', name: '钱七', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=5', description: '测试工程师' },
  { id: '6', name: '孙八', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=6', description: '项目经理' },
  { id: '7', name: '周九', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=7', description: '技术总监' },
  { id: '8', name: '吴十', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=8', description: '数据分析师' },
  { id: '9', name: '郑十一', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=9', description: 'DevOps工程师' },
  { id: '10', name: '冯十二', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=10', description: '安全工程师' },
  { id: '11', name: '陈十三', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=11', description: '全栈开发工程师' },
  { id: '12', name: '楚十四', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=12', description: '移动端开发工程师' },
  { id: '13', name: '魏十五', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=13', description: '算法工程师' },
  { id: '14', name: '蒋十六', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=14', description: '机器学习工程师' },
  { id: '15', name: '韩十七', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=15', description: '深度学习工程师' },
];

interface SearchProps {
  onSelect?: (item: SearchItem) => void;
}

const Search: React.FC<SearchProps> = ({ onSelect }) => {
  const [value, setValue] = useState('');
  const [isFocus, setIsFocus] = useState(false);

  const filteredList = useMemo(() => {
    if (!value.trim()) return [];
    return mockSearchData.filter(item =>
      item.name.toLowerCase().includes(value.toLowerCase()) ||
      item.description.toLowerCase().includes(value.toLowerCase())
    );
  }, [value]);

  const handleSelect = (item: SearchItem) => {
    onSelect?.(item);
    setValue('');
    setIsFocus(false);
  };

  return (
    <div className={styles.searchContainer}>
      <div
        className={styles.searchWrapper}
        onClick={() => {
          const input = document.querySelector(`.${styles.searchInput}`) as HTMLInputElement;
          input?.focus();
        }}
      >
        <SearchOutlined className={styles.searchIcon} />
        <input
          className={styles.searchInput}
          placeholder="搜索"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={() => setIsFocus(true)}
          onBlur={() => setTimeout(() => setIsFocus(false), 200)}
        />
        {value && (
          <CloseOutlined
            className={styles.clearBtn}
            onClick={(e) => {
              e.stopPropagation();
              setValue('');
            }}
          />
        )}
      </div>
      {isFocus && value.trim() && (
        <div className={styles.dropdownContainer}>
          {filteredList.length > 0 ? (
            filteredList.map(item => (
              <div
                key={item.id}
                className={styles.searchItem}
                onClick={() => handleSelect(item)}
              >
                <img src={item.avatar} className={styles.itemImg} alt={item.name} />
                <div className={styles.itemInfo}>
                  <div className={styles.itemName}>{item.name}</div>
                  <div className={styles.itemDesc}>{item.description}</div>
                </div>
              </div>
            ))
          ) : (
            <div className={styles.emptyTip}>未找到相关结果</div>
          )}
        </div>
      )}
    </div>
  );
};

export default Search;
