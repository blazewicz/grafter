import { BranchMark } from '../ui/BrandMarks';
import styles from './Splash.module.css';

export function Splash(): React.JSX.Element {
  return (
    <div className={styles.splash}>
      <BranchMark />
      <span>Grafter</span>
    </div>
  );
}
