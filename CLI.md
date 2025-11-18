# KSeF PDF Generator - CLI

Standalone aplikacja do generowania PDF z XML faktur i UPO.

## Budowanie

### Opcja 1: Docker (zalecane)

```bash
# Zbuduj obraz
docker build -f Dockerfile.cli -t ksef-pdf .

# Wyciągnij executable
docker create --name temp-ksef ksef-pdf
docker cp temp-ksef:/usr/local/bin/ksef-pdf ./ksef-pdf
docker rm temp-ksef

# Nadaj uprawnienia (Linux/macOS)
chmod +x ksef-pdf
```

### Opcja 2: Bun (wymaga instalacji)

```bash
# Zainstaluj Bun
curl -fsSL https://bun.sh/install | bash

# Zainstaluj zależności
bun install

# Zbuduj
bun run build:cli           # Dla aktualnego OS
bun run build:cli:linux     # Linux x64
bun run build:cli:windows   # Windows x64
bun run build:cli:macos     # macOS x64
```

## Użycie

### Podstawowe

```bash
# Faktura
./ksef-pdf faktura.xml

# Z określeniem outputu
./ksef-pdf faktura.xml -o output.pdf

# UPO
./ksef-pdf upo.xml

# Z numerem KSeF i QR code
./ksef-pdf faktura.xml -k "123-456-789" -q "https://ksef-prod.mf.gov.pl/..."
```

### JSON Output

```bash
# Success
./ksef-pdf invoice.xml --json
{
  "success": true,
  "input": "invoice.xml",
  "output": "invoice.pdf",
  "type": "invoice",
  "size": 39731
}

# Error
./ksef-pdf missing.xml --json
{
  "success": false,
  "error": "File not found: missing.xml"
}
```

### Docker

```bash
# Użyj obrazu Docker
docker run -v $(pwd):/data ksef-pdf faktura.xml -o output.pdf

# Lub z hostem
docker run -v /path/to/files:/data ksef-pdf /data/faktura.xml -o /data/output.pdf
```
