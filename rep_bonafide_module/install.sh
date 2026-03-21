
#!/bin/bash
set -e
echo "Installing REP module..."
mkdir -p server/modules/rep
cp -r * server/modules/rep/
echo "REP module installed."
