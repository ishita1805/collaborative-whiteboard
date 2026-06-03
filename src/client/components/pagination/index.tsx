import './pagination.css';
import Icon from '../icon/Icon';
import { useState } from 'react';
import type { PageInfo } from '../../features/pagination';
import type { WhiteboardConfig } from '../../config';

interface PaginationProps {
  config: WhiteboardConfig;
  controls: {
    addPage: () => Promise<void>;
    deletePage: (pageId: string) => Promise<void>;
    switchPage: (pageId: string) => void;
  } | null;
  pages: PageInfo[];
  currentPage: PageInfo;
  following: string | null;
}

const Pagination = ({ config, controls, pages, currentPage, following }: PaginationProps) => {
  const [showDropdown, setShowDropdown] = useState(false);
  const isDark = config.settings.theme === 'dark';

  // Close dropdown when following someone
  if (following && showDropdown) {
    setShowDropdown(false);
  }

  const handleAddPage = async () => {
    if (!controls) return;
    await controls.addPage();
    setShowDropdown(false);
  };

  const handleDeletePage = async (pageId: string) => {
    if (!controls) return;
    await controls.deletePage(pageId);
    setShowDropdown(false);
  };

  return (
    <div className={isDark ? 'pagination-dark' : 'pagination'}>
      <div className="pagination-header" onClick={() => setShowDropdown((s) => !s)}>
        <div>{currentPage?.name}</div>
        <Icon icon={showDropdown ? 'less' : 'more'} className="pagination-icon" />
      </div>
      {showDropdown && (
        <div className={isDark ? 'pagination-dropdown-dark' : 'pagination-dropdown'}>
          {pages.map((p) => (
            <div key={p.id} className="pagination-element">
              <div className="page-label" onClick={() => { controls?.switchPage(p.id); }}>
                {p.name}
              </div>
              {pages.length > 1 && (
                <Icon
                  icon="delete"
                  onClick={() => handleDeletePage(p.id)}
                  className="pagination-icon"
                />
              )}
            </div>
          ))}
          <div
            className={isDark ? 'pagination-create-dark' : 'pagination-create'}
            onClick={handleAddPage}
          >
            Create Page
            <Icon icon="add" className="pagination-icon" />
          </div>
        </div>
      )}
    </div>
  );
};

export default Pagination;
