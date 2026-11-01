"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { NAV } from "./nav";
import styles from "./AppShell.module.css";

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Seções do painel" className={styles.nav}>
      {NAV.map((group, gi) => (
        <div key={group.label ?? gi} className={styles.navGroup}>
          {group.label && <p className={styles.navGroupLabel}>{group.label}</p>}
          <ul>
            {group.items.map((item) => {
              const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              if (!item.ready) {
                return (
                  <li key={item.href}>
                    <span className={`${styles.navItem} ${styles.navItemSoon}`} aria-disabled="true" title="Ainda não construída">
                      <Icon name={item.icon} size={18} />
                      <span className={styles.navLabel}>{item.label}</span>
                      <span className={styles.soon}>em breve</span>
                    </span>
                  </li>
                );
              }
              return (
                <li key={item.href}>
                  <Link href={item.href} className={`${styles.navItem} ${active ? styles.navItemActive : ""}`} aria-current={active ? "page" : undefined}>
                    <Icon name={item.icon} size={18} />
                    <span className={styles.navLabel}>{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
