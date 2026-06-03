import './badge.css';
import Icon from '../icon/Icon';
import type { WhiteboardConfig } from '../../config';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CollabKitClient = any;

interface BadgeProps {
  config: WhiteboardConfig;
  following: string | null;
  client: CollabKitClient;
  followControls: {
    follow: (userId: string) => Promise<void>;
    unfollow: () => Promise<void>;
  } | null;
}

const Badge = ({ config, following, client, followControls }: BadgeProps) => {
  const isDark = config.settings.theme === 'dark';

  const handleUnfollow = async () => {
    if (!followControls) return;
    try {
      await followControls.unfollow();
    } catch { /* silently handle */ }
  };

  const getFollowedUserName = (): string => {
    if (!following || !client) return '';
    try {
      const user = client.users.all.get(following);
      return user?.name || 'Participant';
    } catch {
      return 'Participant';
    }
  };

  // Viewer badge (not following)
  if (!following && config.role === 'viewer') {
    return (
      <div className="badge" style={{ borderColor: 'gray' }}>
        {!config.settings.zen && (
          <div className="label">You have joined as a viewer</div>
        )}
      </div>
    );
  }

  if (!following) return null;

  // Following badge
  return (
    <div className="badge" style={{ borderColor: '#3b82f6' }}>
      {!config.settings.zen && (
        <div className={isDark ? 'label-dark' : 'label'}>
          You are following {getFollowedUserName()}
          <Icon onClick={handleUnfollow} icon="dismiss" className="dismiss" />
        </div>
      )}
    </div>
  );
};

export default Badge;
