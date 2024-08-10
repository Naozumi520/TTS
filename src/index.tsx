import { createRoot } from "react-dom/client";
import { MdClose, MdInfoOutline, MdPlayArrow } from "react-icons/md";

import App from "./App";
import "./index.css";

if (visualViewport !== null) {
	// https://github.com/w3c/csswg-drafts/issues/7194, https://github.com/w3c/csswg-drafts/issues/7475
	const container = document.body.firstElementChild as HTMLDivElement;
	let prevWidth = visualViewport.width;
	let prevHeight = visualViewport.height;
	visualViewport.addEventListener("resize", () => {
		const currWidth = visualViewport!.width;
		const currHeight = visualViewport!.height;
		container.style.transition = prevWidth === (prevWidth = currWidth) && prevHeight > (prevHeight = currHeight)
			? "height 800ms cubic-bezier(0.2, 0.8, 0.4, 1)"
			: "";
		container.style.height = `${currHeight}px`;
	});
}

document.addEventListener("gesturestart", event => event.preventDefault());

const aboutDialog = document.getElementById("about-dialog") as HTMLDialogElement;
document.getElementById("btn-show")!.addEventListener("click", () => {
	// https://stackoverflow.com/a/76158858
	aboutDialog.inert = true;
	aboutDialog.showModal();
	aboutDialog.inert = false;
});

for (const anchor of document.querySelectorAll("a[href^='#']")) {
	const target = document.querySelector((anchor as HTMLAnchorElement).hash);
	if (target) {
		anchor.addEventListener("click", event => {
			event.preventDefault();
			target.scrollIntoView({ behavior: "smooth" });
		});
	}
}

createRoot(document.getElementById("root")!).render(<App />);

const CLASS_NAME_TO_ICON: Record<string, JSX.Element> = {
	"icon-info": <MdInfoOutline size="1.125em" />,
	"icon-close": <MdClose />,
	"icon-play": <MdPlayArrow />,
};

for (const [className, icon] of Object.entries(CLASS_NAME_TO_ICON)) {
	for (const element of document.getElementsByClassName(className)) {
		createRoot(element).render(icon);
	}
}
