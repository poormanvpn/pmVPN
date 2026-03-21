
#!/bin/bash
echo "pmvpn Full Stack Installer"

echo "Available modules:"
echo "1 Hydra"
echo "2 DON"
echo "3 Vault"
echo "4 Podman"
echo "5 REP"
echo "6 All"

read choice

case $choice in
1) ./extensions/hydra/install.sh ;;
2) ./extensions/don/install.sh ;;
3) ./extensions/vault/install.sh ;;
4) ./extensions/podman/install.sh ;;
5) ./extensions/rep/install.sh ;;
6)
./extensions/hydra/install.sh
./extensions/don/install.sh
./extensions/vault/install.sh
./extensions/podman/install.sh
./extensions/rep/install.sh
;;
esac
