import { CircleHelp } from "lucide-react";
import styles from "./help-link.module.css";
export function HelpLink() {
  return (
    <a
      className={styles.help}
      href="/ajuda"
      target="_blank"
      rel="noopener noreferrer"
      title="Abrir manual e baixar PDF em outra aba"
    >
      <CircleHelp size={17} aria-hidden="true" />
      <span>Ajuda</span>
    </a>
  );
}
