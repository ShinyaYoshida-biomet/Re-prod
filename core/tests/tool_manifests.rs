use reprod_core::tools::{ToolManifest, ToolRegistry};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

fn get_r_packages_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tools/r-packages")
}

/// Test that all TOML files in core/tools/r-packages can be parsed as valid ToolManifests
#[test]
fn test_all_manifests_parse() {
    let tools_dir = get_r_packages_dir();

    if !tools_dir.exists() {
        panic!("Tools directory not found: {}", tools_dir.display());
    }

    let entries = fs::read_dir(&tools_dir)
        .unwrap_or_else(|e| panic!("Failed to read tools directory: {}", e));

    let mut manifest_count = 0;
    let mut errors = Vec::new();

    for entry in entries {
        let entry = entry.unwrap();
        let path = entry.path();

        if path.extension().and_then(|s| s.to_str()) == Some("toml") {
            manifest_count += 1;
            let filename = path.file_name().unwrap().to_str().unwrap();

            match fs::read_to_string(&path) {
                Ok(contents) => match toml::from_str::<ToolManifest>(&contents) {
                    Ok(_) => {
                        println!("✓ {} parsed successfully", filename);
                    }
                    Err(e) => {
                        errors.push(format!("Failed to parse {}: {}", filename, e));
                    }
                },
                Err(e) => {
                    errors.push(format!("Failed to read {}: {}", filename, e));
                }
            }
        }
    }

    if !errors.is_empty() {
        panic!("Manifest parsing errors:\n{}", errors.join("\n"));
    }

    assert!(
        manifest_count > 0,
        "No tool manifests found in {}",
        tools_dir.display()
    );
    println!("\n✓ Successfully parsed {} tool manifests", manifest_count);
}

/// Test that the ToolRegistry can load all R package manifests
#[test]
fn test_registry_loads_all_manifests() {
    let tools_dir = get_r_packages_dir();

    let registry = ToolRegistry::load_from_dir(&tools_dir)
        .unwrap_or_else(|e| panic!("Failed to load tool registry: {}", e));

    let manifest_count = registry.len();
    assert!(
        manifest_count > 0,
        "Registry loaded no manifests from {}",
        tools_dir.display()
    );

    println!("✓ Registry loaded {} manifests", manifest_count);

    // Check that we have the expected R package tools
    let expected_tools = vec![
        "ggplot2", "dplyr", "tidyr"
    ];

    for tool_id in expected_tools {
        assert!(
            registry.get(tool_id).is_some(),
            "Expected tool '{}' not found in registry",
            tool_id
        );
        println!("  ✓ Found {}", tool_id);
    }
}

/// Test that all manifests have unique IDs
#[test]
fn test_manifest_ids_unique() {
    let tools_dir = get_r_packages_dir();
    let mut ids = HashSet::new();
    let mut duplicates = Vec::new();

    for entry in fs::read_dir(&tools_dir).unwrap() {
        let entry = entry.unwrap();
        let path = entry.path();

        if path.extension().and_then(|s| s.to_str()) == Some("toml") {
            let contents = fs::read_to_string(&path).unwrap();
            let manifest: ToolManifest = toml::from_str(&contents).unwrap();

            if !ids.insert(manifest.id.clone()) {
                duplicates.push(manifest.id);
            }
        }
    }

    assert!(
        duplicates.is_empty(),
        "Duplicate tool IDs found: {:?}",
        duplicates
    );
}

/// Test that all capabilities have unique IDs within each manifest
#[test]
fn test_capability_ids_unique_within_manifest() {
    let registry = ToolRegistry::load_from_dir(get_r_packages_dir()).unwrap();
    let mut errors = Vec::new();

    for manifest in registry.iter() {
        let mut cap_ids = HashSet::new();

        for capability in &manifest.capabilities {
            if !cap_ids.insert(&capability.id) {
                errors.push(format!(
                    "Duplicate capability ID '{}' in tool '{}'",
                    capability.id, manifest.id
                ));
            }
        }
    }

    assert!(
        errors.is_empty(),
        "Capability ID uniqueness errors:\n{}",
        errors.join("\n")
    );
}

/// Test that all manifests have required fields
#[test]
fn test_manifests_have_required_fields() {
    let registry = ToolRegistry::load_from_dir(get_r_packages_dir()).unwrap();
    let mut errors = Vec::new();

    for manifest in registry.iter() {
        if manifest.id.is_empty() {
            errors.push(format!("Manifest missing 'id' field"));
        }
        if manifest.display_name.is_empty() {
            errors.push(format!("Manifest '{}' missing 'display_name'", manifest.id));
        }
        if manifest.description.is_empty() {
            errors.push(format!("Manifest '{}' missing 'description'", manifest.id));
        }
    }

    assert!(
        errors.is_empty(),
        "Manifest validation errors:\n{}",
        errors.join("\n")
    );
}

/// Test that all capabilities have required fields
#[test]
fn test_capabilities_have_required_fields() {
    let registry = ToolRegistry::load_from_dir(get_r_packages_dir()).unwrap();
    let mut errors = Vec::new();

    for manifest in registry.iter() {
        for capability in &manifest.capabilities {
            if capability.id.is_empty() {
                errors.push(format!(
                    "Tool '{}': capability missing 'id'",
                    manifest.id
                ));
            }
            if capability.display_name.is_empty() {
                errors.push(format!(
                    "Tool '{}': capability '{}' missing 'display_name'",
                    manifest.id, capability.id
                ));
            }
            if capability.description.is_empty() {
                errors.push(format!(
                    "Tool '{}': capability '{}' missing 'description'",
                    manifest.id, capability.id
                ));
            }
            if capability.entrypoint.is_empty() {
                errors.push(format!(
                    "Tool '{}': capability '{}' missing 'entrypoint'",
                    manifest.id, capability.id
                ));
            }
            if capability.template.is_none() {
                errors.push(format!(
                    "Tool '{}': capability '{}' missing 'template'",
                    manifest.id, capability.id
                ));
            }
        }
    }

    assert!(
        errors.is_empty(),
        "Capability validation errors:\n{}",
        errors.join("\n")
    );
}

/// Test that R package manifests specify required packages
#[test]
fn test_r_packages_specify_requirements() {
    let registry = ToolRegistry::load_from_dir(get_r_packages_dir()).unwrap();
    let mut errors = Vec::new();

    for manifest in registry.iter() {
        if matches!(manifest.kind, reprod_core::tools::ToolKind::RPackage) {
            if manifest.validation.requires_packages.is_empty() {
                errors.push(format!(
                    "R package tool '{}' doesn't specify required packages",
                    manifest.id
                ));
            }
            if manifest.runtime.r_library.is_none() {
                errors.push(format!(
                    "R package tool '{}' doesn't specify r_library",
                    manifest.id
                ));
            }
        }
    }

    assert!(
        errors.is_empty(),
        "R package validation errors:\n{}",
        errors.join("\n")
    );
}

/// Test that CLI manifests specify required binaries
#[test]
fn test_cli_tools_specify_requirements() {
    let registry = ToolRegistry::load_from_dir(get_r_packages_dir()).unwrap();
    let mut errors = Vec::new();

    for manifest in registry.iter() {
        if matches!(manifest.kind, reprod_core::tools::ToolKind::Cli) {
            if manifest.validation.requires_cli.is_empty() {
                errors.push(format!(
                    "CLI tool '{}' doesn't specify required CLI binaries",
                    manifest.id
                ));
            }
            if manifest.runtime.cli_binary.is_none() {
                errors.push(format!(
                    "CLI tool '{}' doesn't specify cli_binary",
                    manifest.id
                ));
            }
        }
    }

    assert!(
        errors.is_empty(),
        "CLI tool validation errors:\n{}",
        errors.join("\n")
    );
}

/// Test that capability templates exist and are non-empty
#[test]
fn test_capability_templates_exist() {
    let registry = ToolRegistry::load_from_dir(get_r_packages_dir()).unwrap();
    let mut errors = Vec::new();

    for manifest in registry.iter() {
        for capability in &manifest.capabilities {
            if let Some(template) = &capability.template {
                if template.trim().is_empty() {
                    errors.push(format!(
                        "Tool '{}', capability '{}': template is empty",
                        manifest.id, capability.id
                    ));
                }

                // Basic check: templates should contain {{}} placeholders if they have parameters
                if !capability.input_spec.is_empty() && !template.contains("{{") {
                    errors.push(format!(
                        "Tool '{}', capability '{}': template has parameters but no placeholders",
                        manifest.id, capability.id
                    ));
                }
            } else {
                errors.push(format!(
                    "Tool '{}', capability '{}': template is missing",
                    manifest.id, capability.id
                ));
            }
        }
    }

    assert!(
        errors.is_empty(),
        "Template validation errors:\n{}",
        errors.join("\n")
    );
}

/// Test that we can retrieve capabilities from the registry
#[test]
fn test_registry_capability_lookup() {
    let registry = ToolRegistry::load_from_dir(get_r_packages_dir()).unwrap();

    // Test known R package capabilities
    let test_cases = vec![
        ("ggplot2::scatter_plot", "ggplot2"),
        ("dplyr::filter", "dplyr"),
        ("tidyr::pivot_longer", "tidyr"),
    ];

    for (capability_id, expected_tool_id) in test_cases {
        match registry.capability(capability_id) {
            Some((manifest, capability)) => {
                assert_eq!(
                    manifest.id, expected_tool_id,
                    "Capability '{}' should belong to tool '{}'",
                    capability_id, expected_tool_id
                );
                assert_eq!(
                    capability.id, capability_id,
                    "Capability ID mismatch"
                );
                println!("  ✓ Found capability '{}'", capability_id);
            }
            None => {
                panic!("Capability '{}' not found in registry", capability_id);
            }
        }
    }
}

/// Test that input parameter specifications are valid
#[test]
fn test_parameter_specs_valid() {
    let registry = ToolRegistry::load_from_dir(get_r_packages_dir()).unwrap();
    let mut errors = Vec::new();

    for manifest in registry.iter() {
        for capability in &manifest.capabilities {
            for param in &capability.input_spec {
                if param.name.is_empty() {
                    errors.push(format!(
                        "Tool '{}', capability '{}': parameter missing name",
                        manifest.id, capability.id
                    ));
                }

                // Check enum parameters have options
                if matches!(param.kind, reprod_core::tools::ParameterType::Enum) {
                    if param.options.is_empty() {
                        errors.push(format!(
                            "Tool '{}', capability '{}', parameter '{}': enum type must specify options",
                            manifest.id, capability.id, param.name
                        ));
                    }
                }

                // Check integer/float parameters with min/max are valid
                if let Some(min) = param.min {
                    if let Some(max) = param.max {
                        if min > max {
                            errors.push(format!(
                                "Tool '{}', capability '{}', parameter '{}': min ({}) > max ({})",
                                manifest.id, capability.id, param.name, min, max
                            ));
                        }
                    }
                }
            }
        }
    }

    assert!(
        errors.is_empty(),
        "Parameter specification errors:\n{}",
        errors.join("\n")
    );
}

/// Test that output specifications are valid
#[test]
fn test_output_specs_valid() {
    let registry = ToolRegistry::load_from_dir(get_r_packages_dir()).unwrap();
    let mut errors = Vec::new();

    for manifest in registry.iter() {
        for capability in &manifest.capabilities {
            if capability.output_spec.is_empty() {
                errors.push(format!(
                    "Tool '{}', capability '{}': no output specification",
                    manifest.id, capability.id
                ));
            }

            for output in &capability.output_spec {
                // File outputs should specify a path
                if matches!(output.kind, reprod_core::tools::OutputType::File) {
                    if output.path.is_none() {
                        errors.push(format!(
                            "Tool '{}', capability '{}': file output missing path",
                            manifest.id, capability.id
                        ));
                    }
                }

                // R object outputs should specify a class
                if matches!(output.kind, reprod_core::tools::OutputType::RObject) {
                    if output.class.is_none() {
                        errors.push(format!(
                            "Tool '{}', capability '{}': r-object output missing class",
                            manifest.id, capability.id
                        ));
                    }
                }
            }
        }
    }

    assert!(
        errors.is_empty(),
        "Output specification errors:\n{}",
        errors.join("\n")
    );
}
