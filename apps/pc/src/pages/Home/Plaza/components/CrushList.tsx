import { useIntl } from '@umijs/max';
import { get_plaza_likes } from '@workspace/services';
import PlazaUserGrid from './PlazaUserGrid';

const CrushList = () => {
  const intl = useIntl();
  return (
    <PlazaUserGrid
      fetch={(page, size) => get_plaza_likes(page, size)}
      emptyText={intl.formatMessage({ id: 'plaza.crushEmpty' })}
    />
  );
};

export default CrushList;
