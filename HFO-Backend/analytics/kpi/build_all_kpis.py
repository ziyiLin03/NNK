import subprocess
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent

SCRIPTS = [
    "build_operational_kpis.py",
    "build_demographics_kpis.py",
    "build_dashboards.py", 
]


def main() -> None:
    for script in SCRIPTS:
        script_path = SCRIPT_DIR / script
        print(f"Running {script_path.name}...", flush=True)
        subprocess.run([sys.executable, str(script_path)], check=True)

    print("All KPI outputs generated correctly.", flush=True)


if __name__ == "__main__":
    main()
