{ self }:
{ config, lib, pkgs, ... }:
let
  cfg = config.services.mnemonic;
in {
  options.services.mnemonic = {
    enable = lib.mkEnableOption "mnemonic memory server";

    package = lib.mkOption {
      type = lib.types.package;
      default = self.packages.${pkgs.system}.default;
      description = "Package that provides the mnemonic executable.";
    };

    port = lib.mkOption {
      type = lib.types.port;
      default = 8787;
      description = "Port for the mnemonic HTTP server.";
    };

    environmentFile = lib.mkOption {
      type = lib.types.nullOr lib.types.path;
      default = null;
      example = "/run/secrets/mnemonic.env";
      description = "Optional systemd EnvironmentFile containing API_KEY and overrides.";
    };
  };

  config = lib.mkIf cfg.enable {
    systemd.services.mnemonic = {
      description = "mnemonic memory server";
      wantedBy = [ "multi-user.target" ];
      after = [ "network-online.target" ];
      wants = [ "network-online.target" ];

      environment = {
        PORT = toString cfg.port;
      };

      serviceConfig = {
        Type = "simple";
        ExecStart = "${cfg.package}/bin/mnemonic";
        Restart = "on-failure";
        RestartSec = 2;
        DynamicUser = true;
        StateDirectory = "mnemonic";
        WorkingDirectory = "/var/lib/mnemonic";
        EnvironmentFile = lib.mkIf (cfg.environmentFile != null) cfg.environmentFile;
      };
    };
  };
}
