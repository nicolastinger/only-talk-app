import { Splitter } from 'antd';
import SearchBar from '@/components/SearchBar';
import FriendList from '@/pages/Home/Contacts/components/FriendList';
import { Outlet } from '@umijs/max';
import styles from './index.less';

const ContactsLayout = () => {
  return (
    <Splitter>
      <Splitter.Panel
        min="10%"
        max="50%"
        defaultSize="36%"
        className={styles.left}
      >
        <div className={styles.header}>
          <SearchBar />
        </div>
        <div className={styles.item} key="chat">
          <FriendList key={'contact'} />
        </div>
      </Splitter.Panel>
      <Splitter.Panel className={styles.right}>
        <Outlet />
      </Splitter.Panel>
    </Splitter>
  );
};

export default ContactsLayout;
