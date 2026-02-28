# Mnemonic

Mnemonic is a self-hosted memory layer for agents.
It exposes durable memory via REST with scoped recall.

## Local references

- **Runtime API**: `src/index.ts`
- **Service logic**: `src/service.ts`
- **Schema source of truth**: `src/database/schema/`
- **DB migrations**: `src/database/migrations/`

## Nix Flake

### Development shell

```sh
nix develop
```

Provides `bun`, `nodejs_22`, and `pkg-config`.

### Run the server

```sh
nix run            # starts mnemonic on :8787
```

Environment variables: `PORT`, `DB_PATH`, `API_KEY`.

### Run the CLI

```sh
nix run .#mm -- <command>
```

### Install agent skills globally

```
mm install-skill
```

or manually:

```sh
cp -r .opencode/skills/* ~/.agents/skills/
```

Installs mnemonic agent skills to `~/.agents/skills/`.

### NixOS module

```nix
{
  inputs.mnemonic.url = "github:user/mnemonic";

  # in your configuration:
  imports = [ mnemonic.nixosModules.default ];

  services.mnemonic = {
    enable = true;
    port = 8787;                              # default
    environmentFile = "/run/secrets/mnemonic.env"; # API_KEY etc.
    cli.enable = true;                        # installs mm, sets MNEMONIC_URL
  };
}
```

---

## Bootstrap Skill

Need a skill? See `.opencode/skills/mnemonic-bootstrap/SKILL.md`.
