{
  description = "deja development environment and service module";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    let
      eachSystem = flake-utils.lib.eachDefaultSystem (system:
        let
          pkgs = import nixpkgs {
            inherit system;
          };

          dejaPackage = pkgs.writeShellApplication {
            name = "deja";
            runtimeInputs = [
              pkgs.bun
              pkgs.coreutils
            ];
            text = ''
              set -euo pipefail

              source_snapshot="${self}"
              state_dir="''${STATE_DIRECTORY:-/var/lib/deja}"
              app_dir="$state_dir/app"
              marker_file="$app_dir/.deja-source-store-path"

              mkdir -p "$state_dir"

              if [ ! -f "$marker_file" ] || [ "$(cat "$marker_file")" != "$source_snapshot" ]; then
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
              export DB_PATH="''${DB_PATH:-$state_dir/deja.db}"
              export HF_HOME="''${HF_HOME:-$state_dir/.cache/huggingface}"
              export TRANSFORMERS_CACHE="''${TRANSFORMERS_CACHE:-$HF_HOME}"
              mkdir -p "$(dirname "$DB_PATH")" "$HF_HOME"

              exec bun run src/index.ts
            '';
          };
        in {
          packages.default = dejaPackage;

          apps.default = {
            type = "app";
            program = "${dejaPackage}/bin/deja";
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
      nixosModules.default = import ./nix/modules/deja.nix { inherit self; };
    };
}
