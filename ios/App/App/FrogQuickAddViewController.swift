import UIKit

/**
 The whole point of the widget: catching a task before it slips your mind.

 Native rather than the webview, for two reasons. The app loads frogress.com
 over the network, so routing a capture through it would mean watching a splash
 screen for a second or two — long enough that people go back to not writing
 things down. And WKWebView will not raise the keyboard for a focus() call that
 cannot inherit a touch made inside the webview, which a launch from the home
 screen never can. A UITextField has no such restriction.

 The text lands in the App Group and the webview replays it through the normal
 task endpoints next time it runs (see FrogWidgetStore and
 src/lib/widget/sync.ts), so fly caps, the ledger and quest counters all stay on
 their usual path. Mirrors FrogQuickAddActivity on Android.
 */
final class FrogQuickAddViewController: UIViewController {

    /// Handed the trimmed text; nil when the composer was dismissed empty.
    var onFinish: ((String?) -> Void)?

    private let card = UIView()
    private let field = UITextField()
    private let dimming = UIView()

    private enum Palette {
        static let accent = UIColor(red: 0.0, green: 0.647, blue: 0.235, alpha: 1)  // #00A53C
        static let card = UIColor { traits in
            traits.userInterfaceStyle == .dark
                ? UIColor(red: 0.110, green: 0.169, blue: 0.137, alpha: 1)
                : .white
        }
        static let text = UIColor { traits in
            traits.userInterfaceStyle == .dark ? .white : UIColor(white: 0.04, alpha: 1)
        }
        static let field = UIColor { traits in
            traits.userInterfaceStyle == .dark
                ? UIColor(white: 1, alpha: 0.08)
                : UIColor(red: 0.949, green: 0.969, blue: 0.941, alpha: 1)
        }
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .clear
        buildDimming()
        buildCard()
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        // First responder here rather than in viewDidLoad: before the view is
        // in the window the keyboard has nothing to attach to.
        field.becomeFirstResponder()
        UIView.animate(withDuration: 0.2) { self.dimming.alpha = 1 }
    }

    private func buildDimming() {
        dimming.backgroundColor = UIColor.black.withAlphaComponent(0.35)
        dimming.alpha = 0
        dimming.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(dimming)
        NSLayoutConstraint.activate([
            dimming.topAnchor.constraint(equalTo: view.topAnchor),
            dimming.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            dimming.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            dimming.trailingAnchor.constraint(equalTo: view.trailingAnchor),
        ])
        dimming.addGestureRecognizer(
            UITapGestureRecognizer(target: self, action: #selector(cancel))
        )
    }

    private func buildCard() {
        card.backgroundColor = Palette.card
        card.layer.cornerRadius = 22
        card.layer.cornerCurve = .continuous
        card.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(card)

        let title = UILabel()
        title.text = "Add a task"
        title.font = .systemFont(ofSize: 17, weight: .bold)
        title.textColor = Palette.text

        field.placeholder = "What needs doing?"
        field.font = .systemFont(ofSize: 17)
        field.textColor = Palette.text
        field.backgroundColor = Palette.field
        field.layer.cornerRadius = 14
        field.layer.cornerCurve = .continuous
        field.returnKeyType = .done
        field.autocapitalizationType = .sentences
        field.delegate = self
        field.leftView = UIView(frame: CGRect(x: 0, y: 0, width: 12, height: 1))
        field.leftViewMode = .always
        field.rightView = UIView(frame: CGRect(x: 0, y: 0, width: 12, height: 1))
        field.rightViewMode = .always
        field.heightAnchor.constraint(equalToConstant: 48).isActive = true

        let cancelButton = UIButton(type: .system)
        cancelButton.setTitle("Cancel", for: .normal)
        cancelButton.titleLabel?.font = .systemFont(ofSize: 16, weight: .medium)
        cancelButton.setTitleColor(.secondaryLabel, for: .normal)
        cancelButton.addTarget(self, action: #selector(cancel), for: .touchUpInside)

        let saveButton = UIButton(type: .system)
        saveButton.setTitle("Add", for: .normal)
        saveButton.titleLabel?.font = .systemFont(ofSize: 16, weight: .bold)
        saveButton.setTitleColor(.white, for: .normal)
        saveButton.backgroundColor = Palette.accent
        saveButton.layer.cornerRadius = 14
        saveButton.layer.cornerCurve = .continuous
        saveButton.addTarget(self, action: #selector(save), for: .touchUpInside)
        saveButton.heightAnchor.constraint(equalToConstant: 44).isActive = true
        saveButton.widthAnchor.constraint(greaterThanOrEqualToConstant: 88).isActive = true

        let buttons = UIStackView(arrangedSubviews: [cancelButton, UIView(), saveButton])
        buttons.axis = .horizontal
        buttons.spacing = 12
        buttons.alignment = .center

        let stack = UIStackView(arrangedSubviews: [title, field, buttons])
        stack.axis = .vertical
        stack.spacing = 14
        stack.translatesAutoresizingMaskIntoConstraints = false
        card.addSubview(stack)

        NSLayoutConstraint.activate([
            card.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 16),
            card.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -16),
            // keyboardLayoutGuide tracks the keyboard for us, so the card rides
            // above it without a single keyboard notification.
            card.bottomAnchor.constraint(
                equalTo: view.keyboardLayoutGuide.topAnchor, constant: -16
            ),
            stack.topAnchor.constraint(equalTo: card.topAnchor, constant: 18),
            stack.bottomAnchor.constraint(equalTo: card.bottomAnchor, constant: -18),
            stack.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 18),
            stack.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -18),
        ])
    }

    @objc private func cancel() {
        finish(with: nil)
    }

    @objc private func save() {
        let text = (field.text ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        finish(with: text.isEmpty ? nil : String(text.prefix(200)))
    }

    private func finish(with text: String?) {
        field.resignFirstResponder()
        let handler = onFinish
        onFinish = nil
        dismiss(animated: false) { handler?(text) }
    }
}

extension FrogQuickAddViewController: UITextFieldDelegate {
    func textFieldShouldReturn(_ textField: UITextField) -> Bool {
        save()
        return true
    }
}
