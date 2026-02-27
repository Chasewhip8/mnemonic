{
  description = "mnemonic development environment and service module";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    bun2nix = {
      url = "github:nix-community/bun2nix?tag=2.0.8";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = { self, nixpkgs, flake-utils, bun2nix }:
    let
      eachSystem = flake-utils.lib.eachDefaultSystem (system:
        let
          pkgs = import nixpkgs {
            inherit system;
            overlays = [ bun2nix.overlays.default ];
          };

          mnemonicPackage = pkgs.writeShellApplication {
            name = "mnemonic";
            runtimeInputs = [
              pkgs.bun
              pkgs.coreutils
              pkgs.stdenv.cc.cc.lib
            ];
            text = ''
              set -euo pipefail

              source_snapshot="${self}"
              state_dir="''${STATE_DIRECTORY:-/var/lib/mnemonic}"
              runtime_dir="''${RUNTIME_DIRECTORY:-/run/mnemonic}"
              app_dir="$runtime_dir/app"
              marker_file="$state_dir/.mnemonic-source-store-path"

              mkdir -p "$state_dir"
              mkdir -p "$runtime_dir"

              if [ ! -d "$app_dir/src" ] || [ ! -f "$marker_file" ] || [ "$(cat "$marker_file")" != "$source_snapshot" ]; then
                rm -rf "$app_dir"
                mkdir -p "$app_dir"
                cp -R "$source_snapshot"/. "$app_dir"/
                chmod -R u+w "$app_dir"
                printf "%s" "$source_snapshot" > "$marker_file"
              fi

              cd "$app_dir"

              if [ ! -d node_modules ]; then
                HOME="$state_dir" bun install --frozen-lockfile --production
              fi

              export PORT="''${PORT:-8787}"
              export DB_PATH="''${DB_PATH:-$state_dir/mnemonic.db}"
              export HF_HOME="''${HF_HOME:-$state_dir/.cache/huggingface}"
              export TRANSFORMERS_CACHE="''${TRANSFORMERS_CACHE:-$HF_HOME}"
              export LD_LIBRARY_PATH="${pkgs.lib.makeLibraryPath [ pkgs.stdenv.cc.cc.lib ]}:''${LD_LIBRARY_PATH:-}"
              export NIX_LD_LIBRARY_PATH="$LD_LIBRARY_PATH"
              mkdir -p "$(dirname "$DB_PATH")" "$HF_HOME"

              exec bun run src/index.ts
            '';
          };

          mnemonicCliPackage = pkgs.bun2nix.mkDerivation {
            pname = "mm";
            version = "0.1.0";
            src = self;
            module = "packages/mnemonic-cli/src/main.ts";
            packageJson = ./packages/mnemonic-cli/package.json;
            bunInstallFlags = "--linker=hoisted";
            bunDeps = pkgs.bun2nix.fetchBunDeps {
              bunNix = ./bun.nix;
            };
          };
        in {
          packages.default = mnemonicPackage;
          packages.cli = mnemonicCliPackage;

          apps.default = {
            type = "app";
            program = "${mnemonicPackage}/bin/mnemonic";
          };

          apps.mm = {
            type = "app";
            program = "${mnemonicCliPackage}/bin/mm";
          };

          devShells.default = pkgs.mkShell {
            packages = with pkgs; [
              bun
              nodejs_22
              pkg-config
            ];

            LD_LIBRARY_PATH = pkgs.lib.makeLibraryPath [
              pkgs.stdenv.cc.cc
            ];

            shellHook = ''
              export LD_LIBRARY_PATH="${pkgs.lib.makeLibraryPath [ pkgs.stdenv.cc.cc ]}:''${LD_LIBRARY_PATH:-}"
              export NIX_LD_LIBRARY_PATH="$LD_LIBRARY_PATH"
            '';
          };
        });
    in
    eachSystem // {
      nixosModules.default = import ./nix/modules/mnemonic.nix { inherit self; };
    };
}
