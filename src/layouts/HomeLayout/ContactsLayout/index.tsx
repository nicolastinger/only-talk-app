import SearchBar from '@/components/SearchBar';
import FriendList from '@/pages/Home/Contacts/components/FriendList';
import { Outlet } from '@umijs/max';
import styles from './index.less';

const ContactsLayout = () => {
  return (
    <div className={styles.container}>
      <div className={styles.left}>
        <div className={styles.header}>
          <SearchBar />
        </div>
        <div className={styles.item} key="chat">
          <FriendList key={'contact'} />
        </div>
      </div>
      <div className={styles.right}>
        <Outlet />
      </div>
    </div>
  );
};

export default ContactsLayout;
