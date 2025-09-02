def create_warning(warning: str, text: str = None, line: int = None):
    """
    Creates a warning dictionary with optional text and line information.
    """
    warning = {"warning": warning}

    if text is not None:
        warning["text"] = text

    if line is not None:
        warning["line"] = line

    return warning


def check_missing_copyright(data_json):
    """
    Checks if the 'copyright' field is missing in the JSON data.
    """
    warnings = []
    if "copyright" not in data_json["slices"]:
        warnings.append(create_warning("missing copyright"))
    return warnings


def check_double_glob(data_json, sdf_text):
    """
    Checks for double glob patterns in the JSON data and SDF text.
    """
    warnings = []
    if "**" in sdf_text:
        warnings.append(create_warning("double glob"))

    for name, content in data_json["slices"].items():
        contents_keys = list(content.get("contents", {}).keys())
        for path in contents_keys:
            if "**" in path:
                warnings.append(create_warning("double glob"))
    return warnings


def check_excess_blank_lines(sdf_text):
    """
    Checks for excessive blank lines in the SDF text.
    """
    warnings = []
    blanks = 0
    for line in sdf_text.splitlines():
        if line.strip() == "":
            blanks += 1
        else:
            blanks = 0
        if blanks > 2:
            warnings.append(create_warning("excess blank lines"))
            break
    return warnings


# TODO: apply DRY. Source from static location.
arch_sigs = [
    "arm",
    "amd64",
    "x86",
    "aarch",
    "i386",
    "riscv",
    "ppc64",
    "s390x",
]


def check_architecture_comments(sdf_text):
    """
    Checks for architecture-related comments in the SDF text.
    """
    warnings = []
    for line in sdf_text.splitlines():
        if "#" in line:
            comments_content = line.split("#", 1)[1]
            if any(arch in comments_content for arch in arch_sigs):
                warnings.append(create_warning("architecture comments"))
                break
    return warnings


def check_unsorted_contents(data_json):
    """
    Checks if contents and essentials in the JSON data are unsorted.
    """
    warnings = []
    for name, content in data_json["slices"].items():
        contents_keys = list(content.get("contents", {}).keys())
        essentials = content.get("essential", [])

        for names in [contents_keys, essentials]:
            if names != sorted(names):
                warnings.append(create_warning("unsorted content"))
                break
    return warnings


def check_sdf(data_json, sdf_text):
    """
    Runs all checks on the JSON data and SDF text.
    """
    warnings = []
    warnings.extend(check_missing_copyright(data_json))
    warnings.extend(check_double_glob(data_json, sdf_text))
    warnings.extend(check_excess_blank_lines(sdf_text))
    warnings.extend(check_architecture_comments(sdf_text))
    warnings.extend(check_unsorted_contents(data_json))
    return warnings
