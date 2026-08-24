{pkgs}: {
  deps = [
    pkgs.libgbm
    pkgs.xorg.libxshmfence
    pkgs.xorg.libXrandr
    pkgs.xorg.libXfixes
    pkgs.xorg.libXext
    pkgs.xorg.libXdamage
    pkgs.xorg.libXcomposite
    pkgs.xorg.libxcb
    pkgs.xorg.libX11
    pkgs.alsa-lib
    pkgs.libxkbcommon
    pkgs.pango
    pkgs.mesa
    pkgs.libdrm
    pkgs.dbus
    pkgs.cups
    pkgs.cairo
    pkgs.at-spi2-atk
    pkgs.atk
    pkgs.nss
    pkgs.nspr
    pkgs.glib
    pkgs.unzip
  ];
}
