.PHONY: build build-win

build:
	mkdir -p dist
	go build -o dist/gamebk ./cmd/gamebk

build-win:
	mkdir -p dist
	GOOS=windows GOARCH=amd64 go build -o dist/gamebk.exe ./cmd/gamebk
