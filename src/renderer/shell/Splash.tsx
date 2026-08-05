import { BranchMark } from '../ui/BrandMarks';
import styles from './Splash.module.css';

export function Splash(): React.JSX.Element {
  return (
    <div className={styles.splash} role="status" aria-label="Loading Grafter">
      <BranchMark />
      <span>Grafter</span>
    </div>
  );
}
