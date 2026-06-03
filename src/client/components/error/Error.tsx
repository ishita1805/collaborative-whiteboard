import './error.css';
import Icon from '../icon/Icon';
import { useWhiteboard } from '../../context';

const ErrorModal = () => {
  const { error, setError } = useWhiteboard();
  if (!error) return null;

  return (
    <div className="error-modal">
      <div className="error-box">
        <Icon icon="error" className="error-icon" />
        <p>{error}</p>
        <Icon onClick={() => setError('')} icon="dismiss" className="dismiss-error" />
      </div>
    </div>
  );
};

export default ErrorModal;
