import './settings.css';
import Icon from '../icon/Icon';
import Pagination from '../pagination';
import type { WhiteboardConfig } from '../../config';
import type { PageInfo } from '../../features/pagination';

interface SettingsProps {
  config: WhiteboardConfig;
  autoScale: boolean;
  setAutoScale: (v: boolean) => void;
  paginationControls: {
    addPage: () => Promise<void>;
    deletePage: (pageId: string) => Promise<void>;
    switchPage: (pageId: string) => void;
  } | null;
  pages: PageInfo[];
  currentPage: PageInfo;
  following: string | null;
}

const Settings = ({
  config,
  autoScale,
  setAutoScale,
  paginationControls,
  pages,
  currentPage,
  following,
}: SettingsProps) => {
  const isDark = config.settings.theme === 'dark';

  return (
    <div className={isDark ? 'settings-container-dark' : 'settings-container'}>
      <Pagination
        config={config}
        controls={paginationControls}
        pages={pages}
        currentPage={currentPage}
        following={following}
      />
      {!config.settings.zen && (
        <div className="align-row">
          <Icon
            onClick={() => setAutoScale(!autoScale)}
            className={`${isDark ? 'settings-icon-dark' : 'settings-icon'} ${autoScale ? 'active' : ''}`}
            icon="scale"
          />
        </div>
      )}
    </div>
  );
};

export default Settings;
