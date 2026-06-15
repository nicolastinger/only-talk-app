import { SearchOutlined } from '@ant-design/icons';
import { useIntl } from '@umijs/max';
import { invoke } from '@tauri-apps/api/core';
import { ChatSessionVo } from '@workspace/types';
import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import styles from './styles/Search.less';

interface SearchProps {
  onSelect?: (item: ChatSessionVo) => void;
}

// 高亮关键词
const HighlightText: React.FC<{ text: string; keyword: string }> = ({ text, keyword }) => {
  if (!keyword.trim()) return <>{text}</>;
  
  const lowerText = text.toLowerCase();
  const lowerKeyword = keyword.toLowerCase();
  const index = lowerText.indexOf(lowerKeyword);
  
  if (index === -1) return <>{text}</>;
  
  const before = text.slice(0, index);
  const match = text.slice(index, index + keyword.length);
  const after = text.slice(index + keyword.length);
  
  return (
    <>
      {before}
      <span className={styles.highlight}>{match}</span>
      {after}
    </>
  );
};

// 格式化消息内容
const formatMessage = (message: string, textType: number): string => {
  if (textType === 2 || textType === 2002) {
    return '[图片]';
  }
  if (textType === 3 || textType === 2003) {
    return '[文件]';
  }
  if (textType === 4) {
    return '[隐私模式]';
  }
  if (textType === 5) {
    return '[视频通话]';
  }
  if (textType === 12) {
    return '[视频通话邀请]';
  }
  if (textType === 13) {
    return '[已接听]';
  }
  if (textType === 14) {
    return '[已拒绝]';
  }
  if (textType === 15) {
    return '[通话结束]';
  }
  if (textType === 100) {
    return '[WebRTC信令]';
  }
  if (textType === 2004) {
    return '[群通知]';
  }
  try {
    const parsed = JSON.parse(message);
    if (parsed.text) {
      return parsed.text;
    }
  } catch (e) {
    // 解析失败，直接返回原始消息
  }
  return message;
};

const Search: React.FC<SearchProps> = ({ onSelect }) => {
  const intl = useIntl();
  const [value, setValue] = useState('');
  const [isFocus, setIsFocus] = useState(false);
  const [searchResults, setSearchResults] = useState<ChatSessionVo[]>([]);
  const [searching, setSearching] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});

  const handleSearch = useCallback(async (keyword: string) => {
    if (!keyword.trim()) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = (await invoke('search_chat_session', {
        keyword: keyword.trim(),
      })) as ChatSessionVo[];
      setSearchResults(res);
    } catch (e) {
      console.error('搜索会话失败:', e);
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  const updateDropdownPosition = useCallback(() => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setDropdownStyle({
        position: 'fixed',
        top: rect.bottom + 4,
        left: rect.left,
        width: Math.max(rect.width, 280),
      });
    }
  }, []);

  useEffect(() => {
    if (isFocus && value.trim()) {
      updateDropdownPosition();
    }
  }, [isFocus, value, updateDropdownPosition]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setValue(val);
    handleSearch(val);
  };

  const handleSelect = (item: ChatSessionVo) => {
    onSelect?.(item);
    setValue('');
    setSearchResults([]);
    setIsFocus(false);
  };

  const handleClose = () => {
    setIsFocus(false);
  };

  const displayList = useMemo(() => {
    if (!value.trim()) return [];
    return searchResults;
  }, [value, searchResults]);

  const showDropdown = isFocus && value.trim();

  return (
    <div className={styles.searchContainer} ref={containerRef}>
      <div
        className={styles.searchWrapper}
        onClick={() => {
          const input = document.querySelector(
            `.${styles.searchInput}`,
          ) as HTMLInputElement;
          input?.focus();
        }}
      >
        <SearchOutlined className={styles.searchIcon} />
        <input
          className={styles.searchInput}
          placeholder={intl.formatMessage({ id: 'search.placeholder' })}
          value={value}
          onChange={handleChange}
          onFocus={() => setIsFocus(true)}
        />
      </div>
      {showDropdown &&
        createPortal(
          <div className={styles.overlay} onClick={handleClose}>
            <div
              className={styles.dropdownContainer}
              style={dropdownStyle}
              onClick={(e) => e.stopPropagation()}
            >
              {searching ? (
                <div className={styles.emptyTip}>
                  {intl.formatMessage({ id: 'search.searching' })}
                </div>
              ) : displayList.length > 0 ? (
                displayList.map((item) => (
                  <div
                    key={item.nano_id}
                    className={styles.searchItem}
                    onClick={() => handleSelect(item)}
                  >
                    <div className={styles.itemInfo}>
                      <div className={styles.itemName}>
                        <HighlightText text={item.friend_name} keyword={value} />
                        {item.session_type === 2 && (
                          <span className={styles.groupTag}>
                            {intl.formatMessage({ id: 'search.groupTag' })}
                          </span>
                        )}
                      </div>
                      <div className={styles.itemDesc}>
                        <HighlightText text={formatMessage(item.last_message, item.text_type)} keyword={value} />
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className={styles.emptyTip}>
                  {intl.formatMessage({ id: 'search.noResults' })}
                </div>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
};

export default Search;
