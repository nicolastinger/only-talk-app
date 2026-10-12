import { useIntl } from '@umijs/max';
import { get_plaza_matches } from '@workspace/services';
import PlazaUserGrid from './PlazaUserGrid';

const MatchList = () => {
  const intl = useIntl();
  return (
    <PlazaUserGrid
      fetch={(page, size) => get_plaza_matches(page, size)}
      emptyText={intl.formatMessage({ id: 'plaza.matchEmpty' })}
      addType="plaza_match"
    />
  );
};

export default MatchList;
