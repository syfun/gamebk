package backup

import (
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
)

// CopyDir copies all files under src to dst, preserving directory structure.
// Returns total bytes copied.
func CopyDir(src, dst string) (int64, error) {
	info, err := os.Stat(src)
	if err != nil {
		return 0, err
	}
	if !info.IsDir() {
		return 0, fmt.Errorf("source is not a directory: %s", src)
	}
	if _, err := os.Stat(dst); err == nil {
		return 0, fmt.Errorf("destination already exists: %s", dst)
	}

	if err := os.MkdirAll(dst, 0o755); err != nil {
		return 0, err
	}

	var total int64
	err = filepath.WalkDir(src, func(path string, d fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		rel, err := filepath.Rel(src, path)
		if err != nil {
			return err
		}
		if rel == "." {
			return nil
		}
		target := filepath.Join(dst, rel)

		if d.IsDir() {
			return os.MkdirAll(target, 0o755)
		}
		if d.Type()&os.ModeSymlink != 0 {
			return fmt.Errorf("symlink not supported: %s", path)
		}

		copied, err := copyFile(path, target)
		if err != nil {
			return err
		}
		total += copied
		return nil
	})
	if err != nil {
		return 0, err
	}
	return total, nil
}

// CopyDirInto copies all files under src into dst (dst can already exist).
// Returns total bytes copied.
func CopyDirInto(src, dst string) (int64, error) {
	info, err := os.Stat(src)
	if err != nil {
		return 0, err
	}
	if !info.IsDir() {
		return 0, fmt.Errorf("source is not a directory: %s", src)
	}
	if err := os.MkdirAll(dst, 0o755); err != nil {
		return 0, err
	}

	var total int64
	err = filepath.WalkDir(src, func(path string, d fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		rel, err := filepath.Rel(src, path)
		if err != nil {
			return err
		}
		if rel == "." {
			return nil
		}
		target := filepath.Join(dst, rel)

		if d.IsDir() {
			return os.MkdirAll(target, 0o755)
		}
		if d.Type()&os.ModeSymlink != 0 {
			return fmt.Errorf("symlink not supported: %s", path)
		}

		copied, err := copyFile(path, target)
		if err != nil {
			return err
		}
		total += copied
		return nil
	})
	if err != nil {
		return 0, err
	}
	return total, nil
}

// ClearDir removes all contents under dir, but keeps dir itself.
func ClearDir(dir string) error {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return err
	}
	for _, e := range entries {
		if err := os.RemoveAll(filepath.Join(dir, e.Name())); err != nil {
			return err
		}
	}
	return nil
}

func copyFile(src, dst string) (int64, error) {
	in, err := os.Open(src)
	if err != nil {
		return 0, err
	}
	defer func() { _ = in.Close() }()

	if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
		return 0, err
	}
	out, err := os.Create(dst)
	if err != nil {
		return 0, err
	}
	defer func() { _ = out.Close() }()

	n, err := io.Copy(out, in)
	if err != nil {
		return n, err
	}
	return n, out.Sync()
}
