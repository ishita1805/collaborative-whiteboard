import './presence.css';
import Icon from '../icon/Icon';
import { useRef, useState } from 'react';
import { getInitials } from '../../utils/helpers';
import type { OnlineUser } from '../../features/users';
import type { WhiteboardConfig } from '../../config';

interface PresenceProps {
  config: WhiteboardConfig;
  onlineUsers: Map<string, OnlineUser>;
  following: string | null;
  currentUserId: string;
  followControls: {
    follow: (userId: string) => Promise<void>;
    unfollow: () => Promise<void>;
  } | null;
  setError: (error: string) => void;
}

const Presence = ({
  config,
  onlineUsers,
  following,
  currentUserId,
  followControls,
  setError,
}: PresenceProps) => {
  const hostEl = useRef<HTMLDivElement>(null);
  const [showMore, setShowMore] = useState(false);
  const isDark = config.settings.theme === 'dark';

  const handleFollow = async (userId: string) => {
    if (!followControls) return;
    try {
      await followControls.follow(userId);
    } catch {
      setError('Failed to follow user.');
    }
  };

  // Don't show presence if following someone
  if (following) return null;

  // Filter out current user
  const otherUsers = Array.from(onlineUsers.entries()).filter(
    ([id]) => id !== currentUserId
  );
  if (otherUsers.length === 0) return null;

  const visibleUsers = otherUsers.slice(0, 3);
  const overflowUsers = otherUsers.slice(3);

  return (
    <div>
      <div className="user-list">
        {visibleUsers.map(([id, user]) => (
          <div
            key={id}
            className={isDark ? 'user-icon-dark' : 'user-icon'}
            onClick={() => handleFollow(id)}
            style={{ background: user.color || 'blue' }}
          >
            {getInitials(user.name)}
            <div className={isDark ? 'tooltip-dark' : 'tooltip'}>{user.name}</div>
          </div>
        ))}

        {overflowUsers.length > 0 && (
          <div className="more-users-container" ref={hostEl}>
            <Icon
              onClick={() => setShowMore(!showMore)}
              className={isDark ? 'more-users-dark' : 'more-users'}
              icon={showMore ? 'less' : 'more'}
            />
            {showMore && (
              <div className={isDark ? 'user-dropdown-dark' : 'user-dropdown'}>
                {overflowUsers.map(([id, user]) => (
                  <div
                    key={id}
                    className={isDark ? 'user-tile-dark' : 'user-tile'}
                    onClick={() => handleFollow(id)}
                  >
                    <div
                      className={isDark ? 'user-icon-dark' : 'user-icon'}
                      style={{ background: user.color || 'blue' }}
                    >
                      {getInitials(user.name)}
                    </div>
                    <p>{user.name}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Presence;
