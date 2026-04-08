import styles from './toggle.module.css';

interface Props {
  title: string;
  onChange?: () => void;
  checked?: boolean;
  disabled?: boolean;
}

export default function Toggle(props: Props) {
  const {title, onChange, checked, disabled = false} = props;
  return (
    <label htmlFor={title} className={`${styles.toggleContent}`}>
      <span>{title}</span>
      <input
        disabled={disabled}
        id={title}
        type="checkbox"
        onChange={() => {
          onChange && onChange();
        }}
      />
      <div
        className={`${styles.checkbox} ${checked ? styles.checkboxActive : ''}`}>
        <div
          className={`${styles.checkboxInner} ${checked ? styles.checkboxInnerActive : ''}`}></div>
      </div>
    </label>
  );
}
