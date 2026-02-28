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

    apiKey = lib.mkOption {
      type = lib.types.nullOr lib.types.str;
      default = null;
      description = "Optional API key passed to the service as API_KEY. This stores the key in the Nix store, so prefer environmentFile for secrets.";
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
    users.groups.mnemonic = {};

    users.users.mnemonic = {
      isSystemUser = true;
      group = "mnemonic";
      home = "/var/lib/mnemonic";
      createHome = true;
    };

    systemd.services.mnemonic = {
      description = "mnemonic memory server";
      wantedBy = [ "multi-user.target" ];
      after = [ "network-online.target" ];
      wants = [ "network-online.target" ];

      environment = {
        PORT = toString cfg.port;
      } // lib.optionalAttrs (cfg.apiKey != null) {
        API_KEY = cfg.apiKey;
      };

      serviceConfig = {
        Type = "simple";
        ExecStart = "${cfg.package}/bin/mnemonic";
        Restart = "on-failure";
        RestartSec = 2;
        DynamicUser = lib.mkForce false;
        User = "mnemonic";
        Group = "mnemonic";
        StateDirectory = "mnemonic";
        CacheDirectory = "mnemonic";
        WorkingDirectory = "/var/lib/mnemonic";
        EnvironmentFile = lib.mkIf (cfg.environmentFile != null) cfg.environmentFile;
      };
    };
  };
}
