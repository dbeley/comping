{
  description = "bebopa - RYM Cache Overlay browser extension";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
      in
      {
        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            # Build tools
            zip

            # Node.js and package manager
            nodejs_22
            nodePackages.npm

            # Pre-commit framework
            prek

            # JavaScript linting and formatting
            nodePackages.eslint
            nodePackages.prettier

            web-ext
          ];

          shellHook = ''
            # Install pre-commit hooks if not already installed
            if [ -f .pre-commit-config.yaml ] && [ ! -f .git/hooks/pre-commit ]; then
              echo "Installing pre-commit hooks..."
              prek install
            fi

            # Install npm dependencies if package.json exists
            if [ -f package.json ] && [ ! -d node_modules ]; then
              echo "Installing npm dependencies..."
              npm install
            fi
          '';
        };
      }
    );
}
