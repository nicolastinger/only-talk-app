import DraggableHeader from '@/components/DraggableHeader';
import SearchFriend from '@/components/SearchFriend';
import CloseButton from '@/components/TopBar/Buttons/CloseButton';
import styles from './index.less';

const SearchFriendPage = () => {
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.draggable}>
          <DraggableHeader />
        </div>
        <div className={styles.closeBtn}>
          <CloseButton />
        </div>
      </div>
      <div className={styles.content}>
        <SearchFriend />
      </div>
    </div>
  );
};

export default SearchFriendPage;
