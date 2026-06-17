import FriendRequestsModal from '@/components/FriendRequestsModal';
import { openNewWindowWithoutClose } from '@/components/Window/OpenWindow';
import { useBearStore } from '@/store/store';
import {
  BellOutlined,
  SearchOutlined,
  UserAddOutlined,
} from '@ant-design/icons';
import { invoke } from '@tauri-apps/api/core';
import { WebviewOptions } from '@tauri-apps/api/webview';
import type { WindowOptions } from '@tauri-apps/api/window';
import { useIntl } from '@umijs/max';
import { FriendVo, GroupVo } from '@workspace/types';
import { Badge } from 'antd';
import { createPortal } from 'react-dom';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styles from './index.less';

interface SearchResultItem {
  id: string;
  name: string;
  type: 'friend' | 'group';
  data: FriendVo | GroupVo;
}

interface SearchBarProps {
  onSearchSelect?: (item: SearchResultItem) => void;
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

const SearchBar = ({ onSearchSelect }: SearchBarProps) => {
  const intl = useIntl();
  const menuUnread = useBearStore((state) => state.menuUnread);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [value, setValue] = useState('');
  const [isFocus, setIsFocus] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
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
      const [friends, groups] = await Promise.all([
        invoke('search_friend', { keyword: keyword.trim() }) as Promise<FriendVo[]>,
        invoke('search_group', { keyword: keyword.trim() }) as Promise<GroupVo[]>,
      ]);
      const results: SearchResultItem[] = [
        ...friends.map((f) => ({
          id: f.friend_id,
          name: f.friend_name,
          type: 'friend' as const,
          data: f,
        })),
        ...groups.map((g) => ({
          id: g.group_uuid,
          name: g.group_name,
          type: 'group' as const,
          data: g,
        })),
      ];
      setSearchResults(results);
    } catch (e) {
      console.error('搜索好友/群聊失败:', e);
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

  const handleSelect = (item: SearchResultItem) => {
    onSearchSelect?.(item);
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

  const handleNotificationClick = () => {
    setIsModalVisible(true);
  };

  const handleModalClose = () => {
    setIsModalVisible(false);
  };

  const handleAdd = async () => {
    const webviewOptions: WebviewOptions = {
      x: 0,
      y: 0,
      url: `/search/friend`,
      height: 500,
      width: 300,
    };
    const config: WindowOptions = {
      center: true,
    };
    await openNewWindowWithoutClose(
      intl.formatMessage({ id: 'searchBar.addFriend' }),
      webviewOptions,
      config,
    );
  };

  const showDropdown = isFocus && value.trim();

  return (
    <div className={styles.container} ref={containerRef}>
      <div className={styles.searchWrapper}>
        <SearchOutlined className={styles.searchIcon} />
        <input
          className={styles.searchInput}
          placeholder={intl.formatMessage({ id: 'searchBar.search' })}
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
                    key={`${item.type}-${item.id}`}
                    className={styles.searchItem}
                    onClick={() => handleSelect(item)}
                  >
                    <div className={styles.itemInfo}>
                      <div className={styles.itemName}>
                        <HighlightText text={item.name} keyword={value} />
                        <span className={item.type === 'group' ? styles.groupTag : styles.friendTag}>
                          {item.type === 'group'
                            ? intl.formatMessage({ id: 'search.groupTag' })
                            : intl.formatMessage({ id: 'search.friendTag' })}
                        </span>
                      </div>
                      <div className={styles.itemDesc}>
                        {item.type === 'friend'
                          ? <HighlightText text={(item.data as FriendVo).friend_account} keyword={value} />
                          : `${intl.formatMessage({ id: 'search.memberCount' })}: ${(item.data as GroupVo).member_count}`}
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
      <div className={styles.actionBar}>
        <div className={styles.actionBtn} onClick={handleAdd}>
          <UserAddOutlined className={styles.actionIcon} />
          <span>{intl.formatMessage({ id: 'searchBar.addFriend' })}</span>
        </div>
        <div className={styles.divider} />
        <div className={styles.actionBtn} onClick={handleNotificationClick}>
          <Badge
            count={menuUnread.contacts > 99 ? '99+' : menuUnread.contacts}
            overflowCount={99}
            size="small"
          >
            <BellOutlined className={styles.actionIcon} />
          </Badge>
          <span>
            {intl.formatMessage({ id: 'searchBar.friendNotification' })}
          </span>
        </div>
      </div>
      <FriendRequestsModal
        visible={isModalVisible}
        onClose={handleModalClose}
      />
    </div>
  );
};

export default SearchBar;
