export function PrimaryNavigation({ currentPath, onNavigate, t }) {
  const items = [
    { path: "/", label: t("Dashboard") },
    { path: "/backtests/ml", label: "Laboratório ML", badge: "LightGBM" },
  ];

  return (
    <nav className="primary-navigation" aria-label={t("Primary navigation")}>
      <div className="primary-navigation-inner">
        {items.map((item) => {
          const active = item.path === "/"
            ? currentPath === "/"
            : currentPath.startsWith(item.path);
          return (
            <button
              key={item.path}
              type="button"
              className={active ? "primary-navigation-link active" : "primary-navigation-link"}
              onClick={() => onNavigate(item.path)}
              aria-current={active ? "page" : undefined}
            >
              <span>{item.label}</span>
              {item.badge && <small>{item.badge}</small>}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
