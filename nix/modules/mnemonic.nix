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

    cli = {
      enable = lib.mkOption {
        type = lib.types.bool;
        default = true;
        description = "Install the mm CLI and configure it for this service.";
      };

      exportApiKey = lib.mkOption {
        type = lib.types.bool;
        default = false;
        description = "Export MNEMONIC_API_KEY for interactive shells when apiKey is set.";
      };

      package = lib.mkOption {
        type = lib.types.package;
        default = self.packages.${pkgs.system}.cli;
        description = "Package that provides the mm executable.";
      };
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
    assertions = [
      {
        assertion = !(cfg.cli.exportApiKey && cfg.apiKey == null);
        message = "services.mnemonic.cli.exportApiKey requires services.mnemonic.apiKey to be set.";
      }
    ];

    users.groups.mnemonic = {};

    users.users.mnemonic = {
      isSystemUser = true;
      group = "mnemonic";
      home = "/var/lib/mnemonic";
      createHome = true;
    };

    environment.systemPackages = lib.mkIf cfg.cli.enable [
      cfg.cli.package
    ];

    environment.sessionVariables = lib.mkIf cfg.cli.enable ({
      MNEMONIC_URL = "http://127.0.0.1:${toString cfg.port}";
    } // lib.optionalAttrs (cfg.cli.exportApiKey && cfg.apiKey != null) {
      MNEMONIC_API_KEY = cfg.apiKey;
    });

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
