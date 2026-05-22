"use client";

import type { CSSProperties, ReactNode } from "react";
import { HUD, STATUS_COLORS, type AgentStatus } from "./uiTokens";

type HudPanelProps = {
  title?: string;
  subtitle?: string;
  status?: AgentStatus;
  compact?: boolean;
  glowColor?: string;
  selected?: boolean;
  actions?: ReactNode;
  footer?: ReactNode;
  className?: string;
  style?: CSSProperties;
  bodyStyle?: CSSProperties;
  bodyClassName?: string;
  children: ReactNode;
};

/**
 * HudPanel — 通用 EVE/HUD 面板包装组件
 *
 * - 半透明暗底 + 细线边框 + 局部 glow
 * - 顶部小标题(uppercase + letter-spacing)
 * - 可选状态灯(IDLE/BUSY/WAKING/ERROR/OFFLINE)
 * - selected 状态额外 cyan glow
 * - 不做复杂业务逻辑,只是视觉容器
 */
export function HudPanel({
  title,
  subtitle,
  status,
  compact,
  glowColor,
  selected,
  actions,
  footer,
  className,
  style,
  bodyStyle,
  bodyClassName,
  children,
}: HudPanelProps) {
  const statusToken = status ? STATUS_COLORS[status] : null;
  const borderColor = selected
    ? HUD.selectedBorder
    : statusToken?.border ?? HUD.panelBorder;
  const shadow = selected
    ? HUD.selectedGlow
    : glowColor
      ? `0 0 14px ${glowColor}`
      : statusToken?.glow ?? HUD.panelShadow;

  const showHeader = Boolean(title || subtitle || actions || status);

  return (
    <div
      className={className}
      style={{
        background: HUD.panelBg,
        border: `1px solid ${borderColor}`,
        backdropFilter: HUD.panelBlur,
        WebkitBackdropFilter: HUD.panelBlur,
        boxShadow: shadow,
        borderRadius: HUD.panelRadius,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        overflow: "hidden",
        transition: HUD.selectionTransition,
        ...style,
      }}
    >
      {showHeader && (
        <div
          style={{
            padding: compact ? "5px 10px" : "8px 12px",
            borderBottom: `1px solid ${HUD.panelBorder}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            flexShrink: 0,
            background: "rgba(255,255,255,0.015)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1 }}>
            {statusToken && (
              <span
                title={status}
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 999,
                  background: statusToken.dot,
                  boxShadow: statusToken.glow,
                  flexShrink: 0,
                }}
              />
            )}
            {title && (
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: HUD.textSecondary,
                  letterSpacing: HUD.labelLetterSpacing,
                  textTransform: "uppercase",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {title}
              </div>
            )}
            {subtitle && (
              <div
                style={{
                  fontSize: 10,
                  color: HUD.textDim,
                  fontFamily: "ui-monospace, monospace",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  minWidth: 0,
                }}
              >
                {subtitle}
              </div>
            )}
          </div>
          {actions && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
              {actions}
            </div>
          )}
        </div>
      )}
      <div
        className={bodyClassName}
        style={{
          flex: 1,
          minHeight: 0,
          color: HUD.textPrimary,
          ...bodyStyle,
        }}
      >
        {children}
      </div>
      {footer && (
        <div
          style={{
            padding: compact ? "5px 10px" : "6px 12px",
            borderTop: `1px solid ${HUD.panelBorder}`,
            fontSize: 10,
            color: HUD.textDim,
            flexShrink: 0,
            background: "rgba(255,255,255,0.012)",
          }}
        >
          {footer}
        </div>
      )}
    </div>
  );
}
