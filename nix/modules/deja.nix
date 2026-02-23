{ self }:
{ config, lib, pkgs, ... }:
let
  cfg = config.services.deja;
in {
  options.services.deja = {
    enable = lib.mkEnableOption "deja memory server";

    package = lib.mkOption {
      type = lib.types.package;
      default = self.packages.${pkgs.system}.default;
      description = "Package that provides the deja executable.";
    };

    port = lib.mkOption {
      type = lib.types.port;
      default = 8787;
      description = "Port for the deja HTTP server.";
    };

    environmentFile = lib.mkOption {
      type = lib.types.nullOr lib.types.path;
      default = null;
      example = "/run/secrets/deja.env";
      description = "Optional systemd EnvironmentFile containing API_KEY and overrides.";
    };
  };

  config = lib.mkIf cfg.enable {
    systemd.services.deja = {
      description = "deja memory server";
      wantedBy = [ "multi-user.target" ];
      after = [ "network-online.target" ];
      wants = [ "network-online.target" ];

      environment = {
        PORT = toString cfg.port;
      };

      serviceConfig = {
        Type = "simple";
        ExecStart = "${cfg.package}/bin/deja";
        Restart = "on-failure";
        RestartSec = 2;
        DynamicUser = true;
        StateDirectory = "deja";
        WorkingDirectory = "/var/lib/deja";
        EnvironmentFile = lib.mkIf (cfg.environmentFile != null) cfg.environmentFile;
      };
    };
  };
}
