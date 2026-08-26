import { DEFAULT_ICON } from '@/constants';
import { CloseOutlined, HeartOutlined } from '@ant-design/icons';
import { useIntl } from '@umijs/max';
import {
  get_plaza_users,
  getFiles,
  switch_plaza_crush,
} from '@workspace/services';
import { PlazaUser } from '@workspace/types';
import { Button, message, Spin } from 'antd';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import TinderCard from 'react-tinder-card';
import MatchModal from './MatchModal';
import ProfileModal from './ProfileModal';
import { getGenderLabel } from './genderHelper';
import styles from './styles/SwipeDeck.less';

const PAGE_SIZE = 20;

const hashHue = (str: string) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) % 360;
  }
  return hash;
};

const SwipeAvatar = (props: { icon?: string }) => {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    const load = async () => {
      if (!props.icon) {
        setSrc(null);
        return;
      }
      try {
        const files = await getFiles(props.icon);
        setSrc(files?.[0]?.tauri_file_path || null);
      } catch (error) {
        console.error(error);
      }
    };
    load();
  }, [props.icon]);
  return (
    <img
      className={styles.avatar}
      src={src || DEFAULT_ICON}
      alt="avatar"
      onError={(e) => {
        (e.target as HTMLImageElement).src = DEFAULT_ICON;
      }}
    />
  );
};

const SwipeDeck = () => {
  const intl = useIntl();
  const [stack, setStack] = useState<PlazaUser[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [selected, setSelected] = useState<PlazaUser | null>(null);
  const [matched, setMatched] = useState<PlazaUser | null>(null);

  const pageRef = useRef(1);
  const loadingRef = useRef(false);

  const childRefs = useMemo<React.RefObject<any>[]>(
    () => Array.from({ length: stack.length }, () => React.createRef<any>()),
    [stack],
  );

  const load = async (p: number) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const res = await get_plaza_users(p, PAGE_SIZE);
      setStack(res.list || []);
      setHasMore((res.total || 0) > (res.list?.length || 0));
      setCurrentIndex(Math.max(-1, (res.list?.length || 0) - 1));
      pageRef.current = p;
    } catch (error) {
      console.error(error);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  };

  useEffect(() => {
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (currentIndex < 0 && stack.length > 0 && hasMore && !loading) {
      load(pageRef.current + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex]);

  const handleSwipe = (dir: string, user: PlazaUser) => {
    if (dir === 'right') {
      switch_plaza_crush({ target_uuid: user.uuid })
        .then((res) => {
          if (res.matched) {
            setMatched(user);
          }
        })
        .catch((error) => {
          console.error(error);
          message.error(intl.formatMessage({ id: 'plaza.crushFailed' }));
        });
    }
    setCurrentIndex((i) => i - 1);
  };

  const swipe = async (dir: 'left' | 'right') => {
    const ref = childRefs[currentIndex]?.current;
    if (ref && currentIndex >= 0) {
      await ref.swipe(dir);
    }
  };

  const reset = () => {
    setStack([]);
    setCurrentIndex(-1);
    setHasMore(false);
    load(1);
  };

  const canSwipe = currentIndex >= 0;
  const isEmpty = stack.length === 0;

  return (
    <div className={styles.page}>
      {isEmpty ? (
        <div className={styles.state}>
          {loading ? (
            <Spin />
          ) : (
            <>
              <div className={styles.stateText}>
                {intl.formatMessage({ id: 'plaza.swipeEmpty' })}
              </div>
              <Button type="primary" onClick={reset}>
                {intl.formatMessage({ id: 'plaza.swipeEmptyAction' })}
              </Button>
            </>
          )}
        </div>
      ) : (
        <>
          <div className={styles.hint}>
            {intl.formatMessage({ id: 'plaza.swipeHint' })}
          </div>
          <div className={styles.deck}>
            {stack.map((user, index) => {
              const dist = currentIndex - index;
              const peek = Math.max(0, dist);
              const translateY = peek * 12;
              const scale = 1 - peek * 0.05;
              const hue = hashHue(user.uuid || user.username || '');
              const cardStyle = {
                '--card-hue': hue,
                transform: `translateY(${translateY}px) scale(${scale})`,
              } as React.CSSProperties;
              return (
                <TinderCard
                  key={user.uuid}
                  ref={childRefs[index]}
                  className={styles.tinderCard}
                  onSwipe={(dir) => handleSwipe(dir, user)}
                  preventSwipe={['up', 'down']}
                  swipeRequirementType="position"
                  swipeThreshold={140}
                >
                  <div className={styles.card} style={cardStyle}>
                    <div className={styles.cardCover}>
                      <SwipeAvatar icon={user.icon} />
                    </div>
                    <div className={styles.cardBody}>
                      <div className={styles.cardName}>
                        {user.username || ''}
                        {user.age ? (
                          <span className={styles.cardAge}>
                            {user.age}
                            {intl.formatMessage({ id: 'plaza.ageUnit' })}
                          </span>
                        ) : null}
                      </div>
                      <div className={styles.cardMeta}>
                        {user.gender !== undefined && user.gender !== null ? (
                          <span className={styles.cardMetaText}>
                            {getGenderLabel(intl, user.gender)}
                          </span>
                        ) : null}
                        {user.address ? (
                          <span className={styles.cardMetaText}>
                            {user.address}
                          </span>
                        ) : null}
                        <span className={styles.cardMetaText}>
                          {intl.formatMessage({ id: 'plaza.viewProfile' })}
                        </span>
                      </div>
                      {user.motto || user.info ? (
                        <div className={styles.cardMotto}>
                          {user.motto || user.info}
                        </div>
                      ) : null}
                      {(user.tags || []).length > 0 ? (
                        <div className={styles.cardTags}>
                          {user.tags!.map((tag) => (
                            <span key={tag} className={styles.cardTag}>
                              {tag}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </TinderCard>
              );
            })}
          </div>

          <div className={styles.actions}>
            <button
              className={`${styles.actionBtn} ${styles.skipBtn}`}
              disabled={!canSwipe}
              onClick={() => swipe('left')}
              title={intl.formatMessage({ id: 'plaza.swipeSkip' })}
            >
              <CloseOutlined />
            </button>
            <button
              className={`${styles.actionBtn} ${styles.likeBtn}`}
              disabled={!canSwipe}
              onClick={() => swipe('right')}
              title={intl.formatMessage({ id: 'plaza.swipeLike' })}
            >
              <HeartOutlined />
            </button>
          </div>
        </>
      )}

      <ProfileModal user={selected} onClose={() => setSelected(null)} />
      <MatchModal user={matched} onClose={() => setMatched(null)} />
    </div>
  );
};

export default SwipeDeck;
