import type { ReactNode } from "react";
import { Star } from "../icons";
import styles from "./home-shared.module.css";

export function HomeSectionHeading({ id, title, description, children }: { id: string; title: string; description?: string; children?: ReactNode }) {
  return <div className={styles.headingRow}><div><h2 className={styles.heading} id={id}>{title}<Star /></h2>{description ? <p className={styles.lead}>{description}</p> : null}</div>{children}</div>;
}
