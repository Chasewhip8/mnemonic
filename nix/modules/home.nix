{ self }:
{ config, lib, pkgs, ... }:
let
  cfg = config.mnemonic;
in {
  options.mnemonic = {
    skills = {
      enable = lib.mkEnableOption "mnemonic agent skills in ~/.agents/skills/";

      package = lib.mkOption {
        type = lib.types.package;
        default = self.packages.${pkgs.system}.skills;
        description = "Package containing mnemonic skill files.";
      };

      directory = lib.mkOption {
        type = lib.types.str;
        default = ".agents/skills";
        description = "Directory relative to $HOME for skill installation.";
      };
    };

    cli = {
      enable = lib.mkEnableOption "mm CLI";

      package = lib.mkOption {
        type = lib.types.package;
        default = self.packages.${pkgs.system}.cli;
        description = "Package that provides the mm executable.";
      };
    };

    url = lib.mkOption {
      type = lib.types.nullOr lib.types.str;
      default = null;
      example = "http://127.0.0.1:8787";
      description = "Mnemonic server URL exported as MNEMONIC_URL.";
    };

    apiKey = lib.mkOption {
      type = lib.types.nullOr lib.types.str;
      default = null;
      description = "API key exported as MNEMONIC_API_KEY. Ends up in the Nix store — use a secrets manager for production.";
    };
  };

  config = lib.mkMerge [
    (lib.mkIf cfg.skills.enable {
      home.file."${cfg.skills.directory}" = {
        source = cfg.skills.package;
        recursive = true;
      };
    })

    (lib.mkIf cfg.cli.enable {
      home.packages = [ cfg.cli.package ];
    })

    (lib.mkIf (cfg.url != null) {
      home.sessionVariables.MNEMONIC_URL = cfg.url;
    })

    (lib.mkIf (cfg.apiKey != null) {
      home.sessionVariables.MNEMONIC_API_KEY = cfg.apiKey;
    })
  ];
}
