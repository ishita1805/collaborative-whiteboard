import './icon.css';
import iconPack from '../../icons/iconPack.json';

interface Props {
  icon: keyof typeof iconPack;
  className?: string;
  onClick?: (...args: unknown[]) => void;
}

const Icon = ({ icon, className = '', onClick = () => {} }: Props) => {
  return (
    <div
      onClick={onClick}
      className={`icon-wrapper ${className}`}
      dangerouslySetInnerHTML={{ __html: iconPack[icon] }}
    />
  );
};

export default Icon;
